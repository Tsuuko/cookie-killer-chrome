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
        <div>
          <p className="eyebrow">Cookie Killer</p>
          <h1>ホワイトリスト式クリーンアップ</h1>
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
              <span>{TARGET_LABELS[target]}</span>
            </label>
          ))}
        </div>
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
        <h2>実行結果</h2>
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
        {lastResult?.errors.length ? (
          <p className="error">{lastResult.errors.join(' / ')}</p>
        ) : null}
      </section>
    </main>
  );
}

export default App;
