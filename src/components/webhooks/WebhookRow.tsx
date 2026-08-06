"use client";

import { useState } from "react";
import { i18n } from "@i18n";
import type { WebhookConfig, WebhookDelivery, WebhookFlowSummary } from "../../server/models";
import { getWebhookDetail, regenerateWebhookToken } from "../../client/api";
import { IconManager } from "../../shared/iconManager";

function endpointUrl(projectId: string, flowId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/hooks/${projectId}/${flowId}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? i18n.pages.project_webhooks.copied : i18n.pages.project_webhooks.copy}
    </button>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="webhook-delivery-row">
      <div className="webhook-delivery-header" role="button" tabIndex={0} onClick={() => setExpanded((e) => !e)}>
        <span className="run-row-caret">{expanded ? <IconManager.ChevronDownIcon /> : <IconManager.ChevronRightIcon />}</span>
        <span className={`webhook-delivery-status ${delivery.success ? "webhook-delivery-status-ok" : "webhook-delivery-status-fail"}`}>{delivery.status}</span>
        <span className="webhook-delivery-method">{delivery.method}</span>
        <span className="run-row-time">{new Date(delivery.receivedAt).toLocaleString()}</span>
        {delivery.error && <span className="webhook-delivery-error">{delivery.error}</span>}
      </div>
      {expanded && (
        <div className="run-entries">
          <p className="webhook-delivery-detail-label">{i18n.pages.project_webhooks.delivery_headers}</p>
          <pre className="webhook-delivery-body">{delivery.headersJson}</pre>
          <p className="webhook-delivery-detail-label">{i18n.pages.project_webhooks.delivery_body}</p>
          <pre className="webhook-delivery-body">{delivery.bodyText || "—"}</pre>
        </div>
      )}
    </li>
  );
}

export function WebhookRow({ webhook, projectId }: { webhook: WebhookFlowSummary; projectId: string }) {
  const [config, setConfig] = useState<WebhookConfig>(webhook.config);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[] | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const url = endpointUrl(projectId, webhook.flowId);

  function toggleDeliveries(): void {
    if (!showDeliveries && deliveries === null) {
      void getWebhookDetail(projectId, webhook.flowId).then((detail) => setDeliveries(detail.deliveries));
    }
    setShowDeliveries((s) => !s);
  }

  async function regenerate(): Promise<void> {
    if (!window.confirm(i18n.pages.project_webhooks.regenerate_confirm.replace("{name}", webhook.flowName))) return;
    setBusy(true);
    try {
      setConfig(await regenerateWebhookToken(projectId, webhook.flowId));
      setTokenVisible(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="run-row webhook-row">
      <div className="webhook-row-main">
        <span className="run-row-flow-name">{webhook.flowName}</span>
      </div>

      <div className="webhook-endpoint-row">
        <span className="webhook-endpoint-label">{i18n.pages.project_webhooks.endpoint}</span>
        <code className="webhook-endpoint-value">{url}</code>
        <CopyButton value={url} />
      </div>

      <div className="webhook-endpoint-row">
        <span className="webhook-endpoint-label">{i18n.pages.project_webhooks.token_label}</span>
        <code className="webhook-endpoint-value">{tokenVisible ? config.token : "•".repeat(Math.min(config.token.length, 32))}</code>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setTokenVisible((v) => !v)}>
          {tokenVisible ? i18n.pages.project_webhooks.token_hide : i18n.pages.project_webhooks.token_show}
        </button>
        <CopyButton value={config.token} />
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void regenerate()}>
          {i18n.pages.project_webhooks.regenerate_token}
        </button>
      </div>

      <button type="button" className="btn btn-ghost btn-sm webhook-deliveries-toggle" onClick={toggleDeliveries}>
        {showDeliveries ? i18n.pages.project_webhooks.deliveries_hide : i18n.pages.project_webhooks.deliveries_show}
      </button>

      {showDeliveries && (
        <div className="webhook-deliveries">
          <h3 className="webhook-deliveries-title">{i18n.pages.project_webhooks.deliveries_title}</h3>
          {deliveries === null ? null : deliveries.length === 0 ? (
            <p className="page-empty-note">{i18n.pages.project_webhooks.deliveries_empty}</p>
          ) : (
            <ul className="webhook-delivery-list">
              {deliveries.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
