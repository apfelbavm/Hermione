import { registerNode } from "../engine/registry";

// XML to JSON — a plain, dependency-free recursive-descent parser rather than the browser's
// native DOMParser, since DOMParser doesn't exist under plain Node (where compiled graphs run —
// see codegen.ts's "self-contained .mjs, no dependencies" design) and this project avoids
// depending on the interpreter and the compiled output behaving differently for the same graph.
//
// Written ONCE as a plain-JS source string (no TS syntax) rather than twice — once as a real TS
// function for the interpreter, once as a matching string for compileHelpers, the way flow.ts's
// Delay node does for its own tiny one-line helper — because this parser is big enough that two
// hand-kept copies would be a real drift risk. `new Function` derives the actual callable from
// this SAME string once at module load, so the interpreter and the compiled output are provably
// running identical logic, not just similar logic.
//
// Conversion convention (there's no single universal XML<->JSON standard, so this is a documented
// choice, not a spec): an element with only text content becomes that string directly; an element
// with attributes and/or children becomes an object, attributes as "@name" keys, text alongside
// children (if any) as "#text"; repeated sibling elements with the same tag name become an array.
// The whole result is wrapped under the root element's own tag name, matching how most XML-to-JSON
// tools (e.g. xml2js) shape their output. Deliberately out of scope: XML namespaces (a "ns:tag"
// prefix is just treated as a literal tag name), DTDs beyond skipping over them, and validating
// that closing tags actually match their opening tag.
const XML_TO_JSON_SOURCE = `
function xmlToJsonValue(xml) {
  var i = 0;
  var len = xml.length;

  function skipWhitespace() {
    while (i < len && /\\s/.test(xml[i])) i++;
  }

  function isNameChar(ch) {
    return ch !== undefined && !/[\\s/>]/.test(ch);
  }

  function parseName() {
    var start = i;
    while (i < len && isNameChar(xml[i])) i++;
    return xml.slice(start, i);
  }

  function decodeEntities(s) {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function skipMiscUpTo(nextIsLt) {
    while (true) {
      skipWhitespace();
      if (xml.startsWith("<!--", i)) {
        var endC = xml.indexOf("-->", i);
        i = endC === -1 ? len : endC + 3;
      } else if (xml.startsWith("<?", i)) {
        var endP = xml.indexOf("?>", i);
        i = endP === -1 ? len : endP + 2;
      } else if (xml.startsWith("<!DOCTYPE", i)) {
        var endD = xml.indexOf(">", i);
        i = endD === -1 ? len : endD + 1;
      } else {
        break;
      }
    }
  }

  function parseAttributes() {
    var attrs = {};
    while (true) {
      skipWhitespace();
      if (i >= len || xml[i] === "/" || xml[i] === ">") break;
      var name = parseName();
      skipWhitespace();
      if (xml[i] === "=") {
        i++;
        skipWhitespace();
        var quote = xml[i];
        i++;
        var start = i;
        while (i < len && xml[i] !== quote) i++;
        attrs[name] = decodeEntities(xml.slice(start, i));
        i++;
      } else {
        attrs[name] = "";
      }
    }
    return attrs;
  }

  function parseElement() {
    skipMiscUpTo();
    if (xml[i] !== "<") throw new Error("Expected '<' at position " + i);
    i++;
    var tagName = parseName();
    var attributes = parseAttributes();
    skipWhitespace();

    if (xml[i] === "/") {
      i += 2;
      return { tagName: tagName, attributes: attributes, children: [], text: "" };
    }
    i++;

    var children = [];
    var text = "";
    while (true) {
      if (i >= len) break;
      if (xml.startsWith("<![CDATA[", i)) {
        var endCd = xml.indexOf("]]>", i);
        text += xml.slice(i + 9, endCd === -1 ? len : endCd);
        i = endCd === -1 ? len : endCd + 3;
        continue;
      }
      if (xml.startsWith("<!--", i)) {
        var endCm = xml.indexOf("-->", i);
        i = endCm === -1 ? len : endCm + 3;
        continue;
      }
      if (xml.startsWith("</", i)) {
        i += 2;
        parseName();
        skipWhitespace();
        i++;
        break;
      }
      if (xml[i] === "<") {
        children.push(parseElement());
        continue;
      }
      var start2 = i;
      while (i < len && xml[i] !== "<") i++;
      text += decodeEntities(xml.slice(start2, i));
    }

    return { tagName: tagName, attributes: attributes, children: children, text: text.trim() };
  }

  function prefixedAttrs(attrs) {
    var out = {};
    for (var k in attrs) out["@" + k] = attrs[k];
    return out;
  }

  function elementToJson(el) {
    var hasAttributes = Object.keys(el.attributes).length > 0;
    if (el.children.length === 0 && !hasAttributes) return el.text;

    var obj = prefixedAttrs(el.attributes);
    for (var c = 0; c < el.children.length; c++) {
      var child = el.children[c];
      var value = elementToJson(child);
      if (Object.prototype.hasOwnProperty.call(obj, child.tagName)) {
        if (!Array.isArray(obj[child.tagName])) obj[child.tagName] = [obj[child.tagName]];
        obj[child.tagName].push(value);
      } else {
        obj[child.tagName] = value;
      }
    }
    if (el.text) obj["#text"] = el.text;
    return obj;
  }

  var root = parseElement();
  var result = {};
  result[root.tagName] = elementToJson(root);
  return result;
}
`;

// eslint-disable-next-line no-new-func
const xmlToJsonValue: (xml: string) => unknown = new Function(`${XML_TO_JSON_SOURCE}\nreturn xmlToJsonValue;`)();

registerNode({
  type: "xml.toJson",
  label: "XML to JSON",
  group: "XML",
  pins: [
    { id: "xml", label: "XML", type: "string", direction: "input", defaultValue: "" },
    { id: "json", label: "JSON", type: "string", direction: "output" },
    { id: "success", label: "Success", type: "boolean", direction: "output" },
  ],
  evaluate: ({ inputs }) => {
    try {
      return { json: JSON.stringify(xmlToJsonValue(String(inputs.xml ?? ""))), success: true };
    } catch {
      return { json: "", success: false };
    }
  },
  compileEvaluate: ({ inputs }) => {
    // Both output expressions independently re-run the same try/parse IIFE — duplicated work, but
    // the same tradeoff array.ts's own multi-output pure nodes (e.g. Array Get's "element"/"found"
    // both re-deriving the same bounds check) already accept, since compileEvaluate has no way to
    // compute a shared intermediate once and hand it to two different output-pin expressions.
    const attempt = `(() => { try { return { json: JSON.stringify(xmlToJsonValue(String(${inputs.xml}))), success: true }; } catch { return { json: "", success: false }; } })()`;
    return {
      json: `${attempt}.json`,
      success: `${attempt}.success`,
    };
  },
  compileHelpers: { xmlToJsonValue: XML_TO_JSON_SOURCE },
});
