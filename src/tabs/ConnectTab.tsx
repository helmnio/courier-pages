import { RememberedDetails } from '../workspace';
import type { Studio } from '../useStudio';

export function ConnectTab({ s }: { s: Studio }) {
  const { p, connections, connectClient, connectNote, tools, setTools, capabilities } = s;
  return (
    <section className="panel">
      <div className="eyebrow">LOCAL FIRST · HUMAN LED</div>
      <h2>Your writing connections</h2>
      <div className="connection-card">
        <h3>AI connections</h3>
        <p>
          Connect the chats you use. They read your project and propose revisions through one shared
          local server. Proposals land in Revisions and only you can approve them.
        </p>
        <ul className="client-list connect-list">
          {(connections?.clients ?? []).map((c) => (
            <li key={c.id}>
              <div className="connect-row">
                <div>
                  <strong>{c.label}</strong>
                  <small>
                    {c.state === 'connected'
                      ? 'Connected'
                      : c.state === 'outdated'
                        ? 'Connected to an old location'
                        : c.state === 'not-detected'
                          ? c.detail
                          : 'Not connected'}
                  </small>
                </div>
                <button
                  className={c.state === 'connected' ? '' : 'primary'}
                  disabled={c.state === 'not-detected'}
                  onClick={() => void connectClient(c.id)}
                >
                  {c.state === 'connected'
                    ? 'Reconnect'
                    : c.state === 'outdated'
                      ? 'Update'
                      : 'Connect'}
                </button>
              </div>
              {connectNote[c.id] && (
                <p className={'connect-note' + (connectNote[c.id].ok ? ' ok' : '')}>
                  {connectNote[c.id].message}
                  {connectNote[c.id].command && <code>{connectNote[c.id].command}</code>}
                </p>
              )}
            </li>
          ))}
          {!connections && <li>Checking this computer…</li>}
          <li>
            <strong>Chat browser panes</strong>
            <small>
              Open this app in the pane and the Site tools below register automatically.
            </small>
          </li>
          <li>
            <strong>ChatGPT on the web</strong>
            <small>
              Cannot reach this computer directly; it needs the private tunnel in AI_INTEGRATION.md.
            </small>
          </li>
        </ul>
        {connections && (
          <p className="data-path">
            Your screenplays are saved in <code>{connections.dataDirectory}</code>
          </p>
        )}
      </div>
      <div className="connection-card">
        <h3>
          Browser tools <span className="badge">OPTIONAL</span>
        </h3>
        <p>
          Register read and propose actions when document.modelContext is available. Unsupported
          browsers keep the manual editor. Approval stays in the editor.
        </p>
        <label className="toggle">
          <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} />{' '}
          Enable Site tools in this browser (remembered)
        </label>
        <code>document.modelContext?.registerTool</code>
        <p>
          {typeof (document as any).modelContext?.registerTool === 'function'
            ? 'WebMCP registry detected — discovery still requires a compatible client.'
            : 'WebMCP registry unavailable in this browser.'}
        </p>
      </div>
      <div className="connection-card">
        <h3>Hosted ChatGPT</h3>
        <p>
          No direct localhost connection is assumed. A separately configured, authenticated
          reachable transport and account support would be needed. This app does not publish your
          work or open a tunnel.
        </p>
      </div>
      <RememberedDetails
        key={(p?.id ?? 'no-project') + ':' + 'capabilities'}
        storageKey={(p?.id ?? 'no-project') + ':' + 'capabilities'}
      >
        <summary>Server capabilities</summary>
        <pre>{JSON.stringify(capabilities, null, 2)}</pre>
      </RememberedDetails>
    </section>
  );
}
