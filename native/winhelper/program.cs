using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;
static class Program
{
    static int lastPid = 0;
        static IntPtr lastHwnd = IntPtr.Zero;

    static void Main(string[] args)
    {
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };
        if (args.Contains("--demo")) { Demo(stdout); return; }

        var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        string? line;
        while ((line = stdin.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            int id = 0;
            JsonObject reply;
            try
            {
                var req = JsonNode.Parse(line)!.AsObject();
                id = (int?)req["id"] ?? 0;
                var cmd = (string?)req["cmd"] ?? "";
                reply = cmd switch
                {
                    "read" => Read(),
                    "insert" => Insert((string?)req["text"] ?? ""),
                    "trusted" => new JsonObject { ["ok"] = true, ["trusted"] = true },
                    _ => Fail("unknown-command")
                };
            }
            catch (Exception e)
            {
                Console.Error.WriteLine(e.Message);
                reply = Fail("helper-failed");
            }
            reply["id"] = id;
            stdout.WriteLine(reply.ToJsonString());
        }
    }

    // Try it by hand: dotnet run -- --demo
    static void Demo(StreamWriter o)
    {
        Console.Error.WriteLine("Click into a text box in Notepad. Reading in 5 seconds...");
        Thread.Sleep(5000);
        var r = Read();
        o.WriteLine(r.ToJsonString());
        if (r["ok"]?.GetValue<bool>() != true) return;
        Console.Error.WriteLine("Inserting in 5 seconds. Keep the text cursor where it is...");
        Thread.Sleep(5000);
        o.WriteLine(Insert(" [inserted by pai]").ToJsonString());
    }

    static JsonObject Fail(string error) => new JsonObject { ["ok"] = false, ["error"] = error };

    static JsonObject RectJson(System.Windows.Rect r) =>
        new JsonObject { ["x"] = r.X, ["y"] = r.Y, ["w"] = r.Width, ["h"] = r.Height };

        static JsonObject Read()
    {
        AutomationElement? el = null;
        try { el = AutomationElement.FocusedElement; } catch (Exception e) { Console.Error.WriteLine("[read] focus: " + e.Message); }
        if (el == null) return Fail("no-focus");

        var info = el.Current;
        lastPid = info.ProcessId;
        lastHwnd = GetForegroundWindow();
        string name = "unknown";
        try { name = Process.GetProcessById(info.ProcessId).ProcessName; } catch { }

        var res = new JsonObject();
        res["app"] = new JsonObject { ["name"] = name, ["bundleId"] = name.ToLowerInvariant() + ".exe", ["pid"] = info.ProcessId };
        res["role"] = info.ControlType.ProgrammaticName;

        if (info.IsPassword) { res["ok"] = false; res["error"] = "secure"; return res; }

        var fr = info.BoundingRectangle;
        if (!fr.IsEmpty) res["frame"] = RectJson(fr);

        string before = "", after = "";
        bool selected = false;
        JsonObject? caret = null;
        string? problem = null;

        try
        {
            if (el.TryGetCurrentPattern(TextPattern.Pattern, out var tpObj))
            {
              if (name.Equals("chrome", StringComparison.OrdinalIgnoreCase) || name.Equals("msedge", StringComparison.OrdinalIgnoreCase)) { res["ok"] = false; res["error"] = "no-text"; return res; }
                var tp = (TextPattern)tpObj;
                var sels = tp.GetSelection();
                if (sels.Length == 0) problem = "no-text";
                else
                {
                    var sel = sels[0];
                    selected = sel.GetText(1).Length > 0;

                    var head = sel.Clone();
                    head.MoveEndpointByRange(TextPatternRangeEndpoint.End, sel, TextPatternRangeEndpoint.Start);
                    head.MoveEndpointByUnit(TextPatternRangeEndpoint.Start, TextUnit.Character, -2000);
                    before = head.GetText(2000);

                    var tail = sel.Clone();
                    tail.MoveEndpointByRange(TextPatternRangeEndpoint.Start, sel, TextPatternRangeEndpoint.End);
                    tail.MoveEndpointByUnit(TextPatternRangeEndpoint.End, TextUnit.Character, 400);
                    after = tail.GetText(400);

                    var rects = sel.GetBoundingRectangles();
                    if (rects.Length > 0 && !rects[0].IsEmpty) caret = RectJson(rects[0]);
                }
            }
            else if (el.TryGetCurrentPattern(ValuePattern.Pattern, out var vpObj))
            {
                // Simple boxes: whole text, caret assumed at the end.
                var v = ((ValuePattern)vpObj).Current.Value ?? "";
                before = v.Length > 2000 ? v[^2000..] : v;
            }
            else problem = "no-text";
        }
        catch (Exception e)
        {
            // Chrome/Edge web boxes (Gmail etc.) often throw here. Say so, don't crash.
            Console.Error.WriteLine("[read] text pattern failed: " + e.Message);
            problem = "no-text";
        }

        if (problem != null) { res["ok"] = false; res["error"] = problem; return res; }

        res["ok"] = true;
        res["before"] = before;
        res["after"] = after;
        res["selected"] = selected;
        if (caret != null) res["caret"] = caret;
        return res;
    }
    static JsonObject Insert(string text)
    {
        if (lastPid == 0) return Fail("no-field");
            var hwnd = GetForegroundWindow();
        GetWindowThreadProcessId(hwnd, out uint fgPid);
               if (fgPid != (uint)lastPid)
        {
            // The popup probably took focus. Borrow the foreground thread's input rights
            // so Windows lets us hand focus back to the app the user was typing in.
            uint fgThread = GetWindowThreadProcessId(hwnd, out _);
            uint me = GetCurrentThreadId();
            AttachThreadInput(me, fgThread, true);
            SetForegroundWindow(lastHwnd);
            AttachThreadInput(me, fgThread, false);
            Thread.Sleep(200);
            hwnd = GetForegroundWindow();
            GetWindowThreadProcessId(hwnd, out fgPid);
            if (fgPid != (uint)lastPid)
            {
                string fg = "?";
                try { fg = Process.GetProcessById((int)fgPid).ProcessName; } catch { }
                Console.Error.WriteLine($"[insert] foreground={fg} (pid {fgPid}), expected pid {lastPid}");
                return Fail("app-changed");
            }
        }

        var inputs = new List<INPUT>();
        foreach (var ch in text.Replace("\r", "").Replace("\n", " "))
        {
            inputs.Add(Key(ch, false));
            inputs.Add(Key(ch, true));
        }
        if (inputs.Count == 0) return new JsonObject { ["ok"] = true, ["method"] = "keys" };
        uint sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<INPUT>());
        if (sent != inputs.Count) return Fail("insert-failed");
        return new JsonObject { ["ok"] = true, ["method"] = "keys" };
    }

    // ---- Windows keyboard input (types characters, never touches the clipboard) ----
    static INPUT Key(char ch, bool up) => new INPUT
    {
        type = 1,
        u = new InputUnion { ki = new KEYBDINPUT { wVk = 0, wScan = ch, dwFlags = (uint)(up ? 0x0006 : 0x0004), time = 0, dwExtraInfo = IntPtr.Zero } }
    };

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
            [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
}