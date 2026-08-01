"use client";

import { useState } from "react";
import type { StaticImageData } from "next/image";
import { i18n } from "@i18n";
import { registerBuiltins } from "../nodes";
import { buildDemoGraph } from "../templates/demoGraph";
import { buildDropboxTemplateGraph } from "../templates/dropboxTemplateGraph";
import { Graph } from "../engine/graph";
import { serializeGraph } from "../persistence/save";
import dropboxTemplateImage from "../../images/templates/dropbox.webp";
import emptyTemplateImage from "../../images/templates/empty.webp";
import { buildEmptyTemplateIllustrationGraph } from "../templates/emptyTemplateGraph";

registerBuiltins();

type FlowTemplate = {
  id: string;
  name: string;
  buildGraph: () => Graph;
  image?: StaticImageData;
};

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "blank",
    name: i18n.pages.project.template_blank,
    // buildGraph: () => new Graph(nextId("flow-graph"), ""),
    buildGraph: () => buildEmptyTemplateIllustrationGraph(),
    image: emptyTemplateImage,
  },
  {
    id: "demo",
    name: i18n.pages.project.template_demo,
    buildGraph: () => buildDemoGraph(),
  },
  {
    id: "dropbox",
    name: i18n.pages.project.template_dropbox,
    buildGraph: () => buildDropboxTemplateGraph(),
    image: dropboxTemplateImage,
  },
];

/** Pops up when creating a new Flow — the name field behaves exactly like the old inline create-row
 * input, but submission now waits for a template tile to be picked instead of firing on Enter/submit.
 * Templates just build an in-memory Graph and hand back its serialized form; there's no server-side
 * "template" concept, so picking a tile is equivalent to creating a blank Flow and immediately saving
 * a starter graph into it. */
export function CreateFlowDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, graphJson: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  async function handlePickTemplate(template: FlowTemplate): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(i18n.pages.project.create_flow_name_required);
      return;
    }
    setError(null);
    setCreatingTemplateId(template.id);
    try {
      await onCreate(trimmed, serializeGraph(template.buildGraph()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCreatingTemplateId(null);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box create-flow-dialog">
        <h2 className="modal-title">{i18n.pages.project.create_flow_title}</h2>
        <label className="modal-field-row">
          <span className="modal-field-label">{i18n.pages.project.new_flow_placeholder}</span>
          <input type="text" placeholder={i18n.pages.project.new_flow_placeholder} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="flow-template-grid">
          {FLOW_TEMPLATES.map((template) => (
            <button type="button" key={template.id} className="flow-template-tile" disabled={creatingTemplateId !== null} onClick={() => void handlePickTemplate(template)}>
              <div className="flow-template-tile-image">
                {template.image && <img src={template.image.src} alt="" />}
                {creatingTemplateId === template.id && <span className="flow-template-tile-creating">{i18n.pages.project.create_flow_creating}</span>}
              </div>
              <span className="flow-template-tile-name">{template.name}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-gray" onClick={onClose} disabled={creatingTemplateId !== null}>
            {i18n.pages.project.duplicate_cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
