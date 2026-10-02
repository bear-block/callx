package dev.callx.trial.ui;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import java.io.StringWriter;
import org.xmlpull.v1.XmlSerializer;

/** Reads current accessibility windows without requiring a ticking call UI to become idle. */
public final class Dump extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      UiAutomation automation = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      AccessibilityServiceInfo info = automation.getServiceInfo();
      info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
      automation.setServiceInfo(info);
      SystemClock.sleep(200);
      StringWriter text = new StringWriter();
      XmlSerializer xml = Xml.newSerializer();
      xml.setOutput(text);
      xml.startTag(null, "hierarchy");
      for (AccessibilityWindowInfo window : automation.getWindows()) {
        AccessibilityNodeInfo root = window.getRoot();
        if (root != null) node(xml, root, 0);
      }
      xml.endTag(null, "hierarchy");
      xml.flush();
      result.putString("xml", text.toString());
      finish(Activity.RESULT_OK, result);
    } catch (Exception error) {
      result.putString("error", error.toString());
      finish(Activity.RESULT_CANCELED, result);
    }
  }
  private static String value(CharSequence text) { return text == null ? "" : text.toString(); }
  private static void node(XmlSerializer xml, AccessibilityNodeInfo node, int depth) throws Exception {
    if (depth > 80 || !node.isVisibleToUser()) return;
    Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
    xml.startTag(null, "node");
    xml.attribute(null, "text", value(node.getText()));
    xml.attribute(null, "content-desc", value(node.getContentDescription()));
    xml.attribute(null, "package", value(node.getPackageName()));
    xml.attribute(null, "resource-id", value(node.getViewIdResourceName()));
    xml.attribute(null, "enabled", Boolean.toString(node.isEnabled()));
    xml.attribute(null, "bounds", "[" + bounds.left + "," + bounds.top + "][" + bounds.right + "," + bounds.bottom + "]");
    for (int index = 0; index < node.getChildCount(); index++) {
      AccessibilityNodeInfo child = node.getChild(index);
      if (child != null) node(xml, child, depth + 1);
    }
    xml.endTag(null, "node");
  }
}
