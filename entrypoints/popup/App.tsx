import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CleanupResult,
  CleanupSettings,
  CleanupTarget,
  DEFAULT_SETTINGS,
  dedupeSorted,
  loadSettings,
  normalizeDomain,
  patchSettings,
  saveSettings,
} from '../shared/settings';
import './App.css';

const TARGET_LABELS: Record<CleanupTarget, string> = {
  cookies: 'Cookies',
  localStorage: 'Local Storage',
  sessionStorage: 'Session Storage',
  history: 'History',
};

const TARGET_HELP: Record<CleanupTarget, string> = {
  cookies: 'ホワイトリストのドメインは残します。',
  localStorage: 'ホワイトリスト外の保存データを削除します。',
  sessionStorage: '開いているタブのみ対象です。',
  history: '履歴を全削除します。',
};

type Props = {
  mode?: 'popup' | 'options';
};

function App({ mode = 'popup' }: Props) {
  const [settings, setSettings] = useState<CleanupSettings>(DEFAULT_SETTINGS);
  const [domainInput, setDomainInput] = useState('');
  const [status, setStatus] = useState('読み込み中...');
  const [isBusy, setIsBusy] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setStatus('準備完了');
    });
  }, []);

  const enabledTargetCount = useMemo(
    () => Object.values(settings.targets).filter(Boolean).length,
    [settings.targets],
  );
  const cleanupDuration = lastResult
    ? Math.max(0, lastResult.finishedAt - lastResult.startedAt)
    : null;

  async function updateSettings(next: CleanupSettings) {
    setSettings(next);
    await saveSettings(next);
  }

  async function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const domain = normalizeDomain(domainInput);
    if (!domain) {
      setStatus('有効なドメインを入力してください');
      return;
    }

    const next = {
      ...settings,
      whitelistDomains: dedupeSorted([...settings.whitelistDomains, domain]),
    };
    await updateSettings(next);
    setDomainInput('');
    setStatus(`${domain} をホワイトリストに追加しました`);
  }

  async function addCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      setStatus('現在のタブを取得できませんでした');
      return;
    }

    const domain = normalizeDomain(tab.url);
    if (!domain) {
      setStatus('このページはホワイトリストに追加できません');
      return;
    }

    const next = {
      ...settings,
      whitelistDomains: dedupeSorted([...settings.whitelistDomains, domain]),
    };
    await updateSettings(next);
    setStatus(`${domain} をホワイトリストに追加しました`);
  }

  async function removeDomain(domain: string) {
    const next = {
      ...settings,
      whitelistDomains: settings.whitelistDomains.filter((item) => item !== domain),
    };
    await updateSettings(next);
    setStatus(`${domain} を削除しました`);
  }

  async function toggleTarget(target: CleanupTarget) {
    const next = {
      ...settings,
      targets: {
        ...settings.targets,
        [target]: !settings.targets[target],
      },
    };
    await updateSettings(next);
  }

  async function toggleAutoCleanup() {
    const next = await patchSettings({
      autoCleanupEnabled: !settings.autoCleanupEnabled,
    });
    setSettings(next);
    await browser.runtime.sendMessage({ type: 'refresh-context-menu' });
  }

  async function runCleanup() {
    setIsBusy(true);
    setStatus('クリーンアップ中...');

    try {
      const result = await browser.runtime.sendMessage({
        type: 'cleanup-now',
        settings,
      }) as CleanupResult;
      setLastResult(result);
      setSettings(await loadSettings());
      setStatus(result.ok ? 'クリーンアップ完了' : '一部の削除に失敗しました');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className={`app app--${mode}`}>
      <header className="app__header">
        <div className="brand">
          <img className="brand__icon" src="/icon/48.png" alt="" />
          <div>
            <h1>Cookie Killer</h1>
            <p className="tagline">Keep trusted sites, clear the rest.</p>
          </div>
        </div>
        <span className={settings.autoCleanupEnabled ? 'pill pill--on' : 'pill'}>
          Auto {settings.autoCleanupEnabled ? 'ON' : 'OFF'}
        </span>
      </header>

      <section className="panel panel--action">
        <button
          className="primary-button"
          disabled={isBusy || enabledTargetCount === 0}
          onClick={runCleanup}
          type="button"
        >
          今すぐクリーンアップ
        </button>
        <p className="status">{status}</p>
      </section>

      <section className="section">
        <div className="section__title">
          <h2>削除ターゲット</h2>
          <button className="ghost-button" onClick={toggleAutoCleanup} type="button">
            自動削除 {settings.autoCleanupEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="target-grid">
          {(Object.keys(TARGET_LABELS) as CleanupTarget[]).map((target) => (
            <label className="toggle-row" key={target}>
              <input
                checked={settings.targets[target]}
                onChange={() => void toggleTarget(target)}
                type="checkbox"
              />
              <span>
                <strong>{TARGET_LABELS[target]}</strong>
                <small>{TARGET_HELP[target]}</small>
              </span>
            </label>
          ))}
        </div>
        {settings.targets.history ? (
          <p className="notice">
            履歴削除はホワイトリストを無視し、すべての閲覧履歴を削除します。
          </p>
        ) : null}
      </section>

      <section className="section">
        <div className="section__title">
          <h2>ホワイトリスト</h2>
          <button className="ghost-button" onClick={addCurrentTab} type="button">
            現在タブを追加
          </button>
        </div>
        <form className="domain-form" onSubmit={(event) => void addDomain(event)}>
          <input
            onChange={(event) => setDomainInput(event.target.value)}
            placeholder="example.com"
            type="text"
            value={domainInput}
          />
          <button type="submit">追加</button>
        </form>
        <div className="domain-list">
          {settings.whitelistDomains.length === 0 ? (
            <p className="empty">登録なし</p>
          ) : (
            settings.whitelistDomains.map((domain) => (
              <div className="domain-row" key={domain}>
                <span>{domain}</span>
                <button onClick={() => void removeDomain(domain)} type="button">
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="section section--result">
        <div className="section__title">
          <h2>実行結果</h2>
          {lastResult ? (
            <span className={lastResult.ok ? 'result-status' : 'result-status result-status--warn'}>
              {lastResult.ok ? '完了' : `問題 ${lastResult.errors.length} 件`}
            </span>
          ) : null}
        </div>
        <dl className="result-grid">
          <div>
            <dt>Cookie</dt>
            <dd>{lastResult ? `${lastResult.removedCookies} 件` : '-'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{lastResult ? `${lastResult.clearedSessionStorageTabs} タブ` : '-'}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>{lastResult?.clearedLocalStorage ? '実行' : '-'}</dd>
          </div>
          <div>
            <dt>History</dt>
            <dd>{lastResult?.clearedHistory ? '実行' : '-'}</dd>
          </div>
        </dl>
        {lastResult ? (
          <p className="result-meta">
            最終実行: {new Date(lastResult.finishedAt).toLocaleString()} / {cleanupDuration} ms
          </p>
        ) : (
          <p className="result-meta">このセッションではまだ実行していません。</p>
        )}
        {lastResult ? (
          <details className="cleanup-details" open={lastResult.domainSummaries.length > 0}>
            <summary>
              ドメイン別の削除結果
              <span>{lastResult.domainSummaries.length} 件</span>
            </summary>
            {lastResult.domainSummaries.length > 0 ? (
              <div className="summary-list">
                {lastResult.domainSummaries.map((summary) => (
                  <div className="summary-row" key={summary.domain}>
                    <strong>{summary.domain}</strong>
                    <span>
                      Cookie {summary.cookies} 件 / Session {summary.sessionStorageTabs} 件
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-detail">削除されたデータはありません。</p>
            )}
          </details>
        ) : null}
        {lastResult?.errors.length ? (
          <details className="error-details">
            <summary>一部のクリーンアップを実行できませんでした</summary>
            <ul>
              {lastResult.errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </main>
  );
}

export default App;
