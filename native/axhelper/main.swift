// pai-axhelper — reads the focused text box in another app and inserts text into it.
//
// Used only by pai's "Complete my text" hotkey (src/main/compose/). macOS only.
// Talks JSON Lines over stdin/stdout, one request per line:
//   {"id":1,"cmd":"trusted","prompt":false}  -> {"id":1,"ok":true,"trusted":true}
//   {"id":2,"cmd":"read"}                    -> the focused text box: app, text around the caret, caret position
//   {"id":3,"cmd":"insert","text":"..."}     -> puts text at the caret of the box from the last "read"
//
// Privacy: it reads ONLY when asked, never logs or stores text, and refuses
// password fields. It needs the Accessibility permission (System Settings ->
// Privacy & Security -> Accessibility).
import Cocoa
import ApplicationServices

setvbuf(stdout, nil, _IOLBF, 0)

let maxBefore = 2000 // characters of text before the caret sent back
let maxAfter = 400 // and after it

// The text box from the last "read", kept so "insert" goes to the same place.
var lastElement: AXUIElement?
var lastPid: pid_t = 0
var lastRange: CFRange?

func reply(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
    let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}

func str(_ el: AXUIElement, _ name: String) -> String? { attr(el, name) as? String }

func rangeOf(_ el: AXUIElement) -> CFRange? {
  guard let v = attr(el, kAXSelectedTextRangeAttribute), CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
  var r = CFRange()
  return AXValueGetValue(v as! AXValue, .cfRange, &r) ? r : nil
}

func rect(_ v: AnyObject?) -> CGRect? {
  guard let v = v, CFGetTypeID(v) == AXValueGetTypeID() else { return nil }
  var r = CGRect.zero
  return AXValueGetValue(v as! AXValue, .cgRect, &r) ? r : nil
}

func rectDict(_ r: CGRect) -> [String: Double] {
  ["x": Double(r.origin.x), "y": Double(r.origin.y), "w": Double(r.size.width), "h": Double(r.size.height)]
}

/** Screen rectangle of the caret (top-left origin, like Electron), or nil. */
func caretRect(_ el: AXUIElement, _ caret: Int) -> CGRect? {
  for (loc, len) in [(caret, 0), (max(caret - 1, 0), 1)] {
    var range = CFRange(location: loc, length: len)
    guard let param = AXValueCreate(.cfRange, &range) else { continue }
    var out: AnyObject?
    if AXUIElementCopyParameterizedAttributeValue(el, kAXBoundsForRangeParameterizedAttribute as CFString, param, &out) == .success,
      let r = rect(out), r.size.height > 0
    {
      return len == 1 ? CGRect(x: r.maxX, y: r.minY, width: 1, height: r.height) : r
    }
  }
  return nil
}

func frameOf(_ el: AXUIElement) -> CGRect? {
  var p = CGPoint.zero
  var s = CGSize.zero
  guard let pv = attr(el, kAXPositionAttribute), let sv = attr(el, kAXSizeAttribute),
    AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &s)
  else { return nil }
  return CGRect(origin: p, size: s)
}

/** Chrome and Electron apps (Slack, Discord…) only build their accessibility tree when asked. */
func wakeAccessibility(_ app: AXUIElement, browser: Bool) {
  AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
  if browser { AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue) }
}

func focusedElement(_ app: AXUIElement) -> AXUIElement? {
  guard let v = attr(app, kAXFocusedUIElementAttribute), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
  return (v as! AXUIElement)
}

func read(_ id: Any) {
  guard AXIsProcessTrusted() else { return reply(["id": id, "ok": false, "error": "not-trusted"]) }
  guard let front = NSWorkspace.shared.frontmostApplication else { return reply(["id": id, "ok": false, "error": "no-app"]) }
  let pid = front.processIdentifier
  let appInfo: [String: Any] = ["name": front.localizedName ?? "", "bundleId": front.bundleIdentifier ?? "", "pid": Int(pid)]
  let appEl = AXUIElementCreateApplication(pid)

  var el = focusedElement(appEl)
  var value = el.flatMap { str($0, kAXValueAttribute) }
  if el == nil || value == nil {
    // Maybe a Chromium/Electron app with its tree asleep: wake it and look again.
    let bid = front.bundleIdentifier ?? ""
    let browser = ["com.google.Chrome", "com.microsoft.edgemac", "com.brave.Browser", "company.thebrowser.Browser", "com.vivaldi.Vivaldi", "com.operasoftware.Opera"].contains(bid)
    wakeAccessibility(appEl, browser: browser)
    for _ in 0..<4 where el == nil || value == nil {
      usleep(120_000)
      el = focusedElement(appEl)
      value = el.flatMap { str($0, kAXValueAttribute) }
    }
  }
  guard let el = el else { return reply(["id": id, "ok": false, "error": "no-focus", "app": appInfo]) }

  let role = str(el, kAXRoleAttribute) ?? ""
  let subrole = str(el, kAXSubroleAttribute) ?? ""
  if role.contains("Secure") || subrole.contains("Secure") {
    lastElement = nil
    return reply(["id": id, "ok": false, "error": "secure", "app": appInfo])
  }
  guard let text = value else { return reply(["id": id, "ok": false, "error": "no-text", "app": appInfo, "role": role]) }

  let ns = text as NSString
  let range = rangeOf(el) ?? CFRange(location: ns.length, length: 0)
  let caret = min(max(range.location, 0), ns.length)
  let selEnd = min(caret + max(range.length, 0), ns.length)
  let start = max(0, caret - maxBefore)
  let before = ns.substring(with: NSRange(location: start, length: caret - start))
  let after = ns.substring(with: NSRange(location: selEnd, length: min(maxAfter, ns.length - selEnd)))

  lastElement = el
  lastPid = pid
  lastRange = range

  var out: [String: Any] = ["id": id, "ok": true, "app": appInfo, "role": role, "before": before, "after": after, "selected": range.length > 0]
  if let r = caretRect(el, caret) { out["caret"] = rectDict(r) }
  if let f = frameOf(el) { out["frame"] = rectDict(f) }
  reply(out)
}

/** Type text with keyboard events (for apps whose text boxes can't be set directly). */
func typeText(_ text: String) {
  let src = CGEventSource(stateID: .combinedSessionState)
  let units = Array(text.utf16)
  var i = 0
  while i < units.count {
    var chunk = Array(units[i..<min(i + 16, units.count)])
    for down in [true, false] {
      guard let ev = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: down) else { continue }
      ev.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: &chunk)
      ev.post(tap: .cghidEventTap)
    }
    usleep(8_000)
    i += 16
  }
}

func insert(_ id: Any, _ text: String) {
  guard AXIsProcessTrusted() else { return reply(["id": id, "ok": false, "error": "not-trusted"]) }
  guard let el = lastElement else { return reply(["id": id, "ok": false, "error": "no-target"]) }

  // Give the app its focus back (pai's popup had it), then put the caret where it was.
  NSRunningApplication(processIdentifier: lastPid)?.activate()
  usleep(180_000)
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == lastPid else {
    return reply(["id": id, "ok": false, "error": "app-changed"])
  }
  if var r = lastRange, let v = AXValueCreate(.cfRange, &r) {
    AXUIElementSetAttributeValue(el, kAXSelectedTextRangeAttribute as CFString, v)
  }

  let beforeValue = str(el, kAXValueAttribute)
  let setResult = AXUIElementSetAttributeValue(el, kAXSelectedTextAttribute as CFString, text as CFString)
  usleep(60_000)
  let afterValue = str(el, kAXValueAttribute)
  // Some apps say "success" but change nothing; only trust it if the text really changed
  // (or if the text can't be read back at all).
  if setResult == .success && (afterValue == nil || afterValue != beforeValue) {
    lastElement = nil
    return reply(["id": id, "ok": true, "method": "ax"])
  }
  typeText(text)
  lastElement = nil
  reply(["id": id, "ok": true, "method": "keys"])
}

while let line = readLine(strippingNewline: true) {
  guard let data = line.data(using: .utf8),
    let req = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  else { continue }
  let id = req["id"] ?? 0
  switch req["cmd"] as? String {
  case "trusted":
    let prompt = req["prompt"] as? Bool ?? false
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
    reply(["id": id, "ok": true, "trusted": AXIsProcessTrustedWithOptions(opts)])
  case "read":
    read(id)
  case "insert":
    insert(id, req["text"] as? String ?? "")
  default:
    reply(["id": id, "ok": false, "error": "unknown-command"])
  }
}
