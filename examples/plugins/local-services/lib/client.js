window.__ModuleLoader__.load({
  id: 'local-services',
  factory: require => {
    const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = require('react')
    const NAME = 'local-services', TAB = 'local-services:services', API = '/local-services/v1/'
    let locale
    const t = (zh, en) => locale.resolveText({ zh, en })
    const title = () => t('服务管理', 'Services')
    const paths = {
      refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
      play: 'm8 5 11 7-11 7Z', stop: 'M6 6h12v12H6Z',
      auto: 'm13 2-9 12h7l-1 8L20 9h-7Z',
      settings: 'M9 4h6l1 3 3 1 2 4-2 4-3 1-1 3H9l-1-3-3-1-2-4 2-4 3-1Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
      back: 'm14 6-6 6 6 6', copy: 'M9 9h11v11H9Z M15 5V3H3v12h2',
      trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
      close: 'm6 6 12 12M6 18 18 6',
    }
    const icon = name => h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }))
    const button = (name, label, onClick, disabled = false) => h('button', { key: name, type: 'button', className: 'ls-icon', title: label, 'aria-label': label, onClick, disabled }, icon(name))
    const active = service => ['running', 'starting', 'stopping'].includes(service.status)
    async function request(path, body) {
      const response = await fetch(API + path, { credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error?.message || `HTTP ${response.status}`)
      return data
    }
    async function copy(text) {
      if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
      const field = document.createElement('textarea')
      field.value = text
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      const copied = document.execCommand('copy')
      field.remove()
      if (!copied) throw Error(t('复制失败，请选择提示词手动复制。', 'Copy failed. Select the prompt and copy it manually.'))
    }
    const css = `
      .dsh-ha-services{box-sizing:border-box;height:100%;min-height:0;overflow:auto;padding:10px 16px;color:var(--dsw-alias-label-primary,#dce1eb);font:16px/1.55 system-ui,sans-serif;background:var(--dsw-alias-bg-layer-0,transparent);color-scheme:light dark}
      .dsh-ha-services *{box-sizing:border-box}.dsh-ha-services button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .16s ease,box-shadow .16s ease}.dsh-ha-services button:disabled{opacity:.4;cursor:default}
      .dsh-ha-services button:focus{outline:none}
      .dsh-ha-services button:focus-visible{box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary,#929dad)}
      .dsh-ha-services .ls-toolbar{display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:0 0 8px;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-ha-services .ls-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;min-width:40px;min-height:40px;border:0;border-radius:10px;padding:10px;background:transparent;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary,#aeb8c8))}
      .dsh-ha-services :is(.ls-icon,.ls-text-button,.ls-open,.ls-tab,.ls-autostart):focus-visible{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
      .dsh-ha-services :is(.ls-icon,.ls-text-button,.ls-open,.ls-tab,.ls-autostart):active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}
      .dsh-ha-services .ls-service{position:relative;padding:4px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-ha-services .ls-open{display:flex;flex-direction:column;align-items:flex-start;width:100%;min-height:70px;padding:12px 68px 36px 12px;text-align:left;border:0;border-radius:10px;background:transparent}
      .dsh-ha-services .ls-service>.ls-switch{position:absolute;right:12px;top:50%;transform:translateY(-50%)}
      .dsh-ha-services .ls-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:24px}
      .dsh-ha-services .ls-name{min-width:0;overflow-wrap:anywhere;font-size:16px;font-weight:500}
      .dsh-ha-services .ls-subtitle{display:inline-flex;align-items:center;gap:4px;font-size:14px;color:var(--dsw-alias-label-tertiary,#929dad)}
      .dsh-ha-services .ls-subtitle[data-autostart=true]{color:var(--dsw-alias-brand-primary,#829beb)}
      .dsh-ha-services .ls-subtitle svg{flex:none;width:14px;height:14px}
      .dsh-ha-services .ls-autostart{position:absolute;left:6px;bottom:8px;max-width:calc(100% - 74px);min-height:30px;padding:4px 6px;border:0;border-radius:6px;background:transparent;white-space:nowrap}
      .dsh-ha-services .ls-switch{position:relative;flex:none;width:38px;height:22px;min-width:38px;min-height:22px;border:0;border-radius:12px;padding:0;background:var(--dsw-alias-label-quaternary,#697386)}
      .dsh-ha-services .ls-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary,#829beb)}
      .dsh-ha-services .ls-switch:focus-visible{box-shadow:0 0 0 4px var(--dsw-alias-interactive-bg-active,#ffffff24)}
      .dsh-ha-services .ls-switch:active:enabled{filter:brightness(.9)}
      .dsh-ha-services .ls-thumb{display:block;width:16px;height:16px;margin-left:3px;border-radius:50%;background:white;transition:transform .15s ease}
      .dsh-ha-services .ls-switch[aria-checked=true] .ls-thumb{transform:translateX(16px)}
      .dsh-ha-services .ls-details{padding-top:16px;font-size:15px;color:var(--dsw-alias-label-secondary,#aeb8c8)}
      .dsh-ha-services .ls-tabs{position:relative;isolation:isolate;display:flex;flex:none;height:40px;padding:4px;margin-top:16px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
      .dsh-ha-services .ls-tabs:before{content:'';position:absolute;z-index:-1;left:4px;top:4px;bottom:4px;width:calc((100% - 8px)/2);border-radius:999px;background:var(--dsw-alias-interactive-bg-active,#ffffff24);transition:transform .2s ease}
      .dsh-ha-services .ls-tabs[data-active=logs]:before{transform:translateX(100%)}
      .dsh-ha-services .ls-tab{flex:1;min-width:0;font-size:15px;padding:0 10px;border:0;border-radius:999px;background:none;color:var(--dsw-alias-label-secondary,#aeb8c8)}
      .dsh-ha-services .ls-tab[aria-selected=true]{font-weight:600;color:var(--dsw-alias-label-primary,#dce1eb)}
      .dsh-ha-services .ls-detail-actions{display:flex;gap:12px;margin-top:18px}.dsh-ha-services label{display:flex;align-items:center;gap:8px;margin:16px 0}
      .dsh-ha-services input{width:18px;height:18px;accent-color:var(--dsw-alias-brand-primary,#829beb)}
      .dsh-ha-services input:focus-visible,.dsh-ha-services .ls-log:focus-visible{outline:1px solid var(--dsw-alias-label-tertiary,#929dad);outline-offset:2px}
      .dsh-ha-services dl{margin:18px 0}.dsh-ha-services dt{font-size:14px;color:var(--dsw-alias-label-tertiary,#929dad);margin-top:16px}.dsh-ha-services dd{margin:4px 0;overflow-wrap:anywhere}
      .dsh-ha-services pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.65 ui-monospace,monospace;overflow:auto;margin:8px 0}
      .dsh-ha-services.ls-log-view{display:flex;flex-direction:column;overflow:hidden}
      .dsh-ha-services.ls-log-view>.ls-toolbar,.dsh-ha-services.ls-log-view>.ls-error{flex:none}
      .dsh-ha-services.ls-log-view .ls-details{display:flex;flex-direction:column;flex:1;min-height:0}
      .dsh-ha-services.ls-log-view .ls-heading,.dsh-ha-services.ls-log-view .ls-tabs{flex:none}
      .dsh-ha-services .ls-log-content{display:flex;flex:1;min-height:0}
      .dsh-ha-services .ls-log{flex:1;min-height:0;overflow-y:scroll;overscroll-behavior:contain;scrollbar-gutter:stable}
      .dsh-ha-services .ls-text-button{display:inline-flex;align-items:center;gap:8px;background:none;border:0;border-radius:8px;min-height:40px;padding:8px 12px;font-size:15px}
      .dsh-ha-services .ls-settings{padding-top:12px}.dsh-ha-services .ls-settings-actions{display:flex;align-items:center;gap:8px}
      .dsh-ha-services .ls-error{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 0;color:var(--dsw-alias-state-error-primary,#ef9494);font-size:14px}
      .dsh-ha-services .ls-empty{padding:24px 0;font-size:15px;color:var(--dsw-alias-label-tertiary,#929dad)}
      .dsh-ha-services .ls-back{display:flex;align-items:center;gap:6px;min-width:0;margin-right:auto;font-size:15px}.dsh-ha-services .ls-back span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ha-services .ls-prompt{font-size:14px;user-select:text}
      @media(hover:hover){.dsh-ha-services :is(.ls-icon,.ls-text-button,.ls-open,.ls-tab,.ls-autostart):hover:enabled{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}.dsh-ha-services :is(.ls-icon,.ls-text-button,.ls-open,.ls-tab,.ls-autostart):active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}}
      @media(prefers-reduced-motion:reduce){.dsh-ha-services button,.dsh-ha-services .ls-thumb,.dsh-ha-services .ls-tabs:before{transition:none}}
    `
    function Panel() {
      const language = useSyncExternalStore(callback => locale.subscribe(callback), () => locale.getSnapshot())
      const [services, setServices] = useState(null)
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [settings, setSettings] = useState(false)
      const [selectedName, setSelectedName] = useState('')
      const [detailTab, setDetailTab] = useState('overview')
      const [prompt, setPrompt] = useState('')
      const [showPrompt, setShowPrompt] = useState(false)
      const [copied, setCopied] = useState(false)
      const [logs, setLogs] = useState({})
      const revision = useRef(0)
      useEffect(() => { setPrompt(''); setShowPrompt(false); setCopied(false) }, [language.active])
      async function refresh() {
        const version = ++revision.current
        try {
          const result = await request('state')
          if (version === revision.current) setServices(result.services)
        } catch (reason) { if (version === revision.current) setError(reason.message) }
      }
      useEffect(() => {
        if (busy) return
        let timer, mounted = true
        const poll = async () => {
          await refresh()
          if (mounted && !settings && selectedName && detailTab === 'logs') await loadLogs(selectedName)
          if (mounted) timer = setTimeout(poll, 2000)
        }
        poll()
        return () => { mounted = false; clearTimeout(timer); revision.current++ }
      }, [busy, selectedName, detailTab, settings])
      useEffect(() => {
        if (selectedName && services && !services.some(service => service.name === selectedName)) setSelectedName('')
      }, [services, selectedName])
      async function action(op, service, enabled) {
        revision.current++
        setBusy(service?.name || op)
        setError('')
        try {
          const result = await request('action', { op, ...(service ? { name: service.name } : {}), ...(enabled === undefined ? {} : { enabled }) })
          setServices(result.services)
          if (result.failures?.length) setError(result.failures.map(item => `${item.name}: ${item.message}`).join('\n'))
        } catch (reason) { setError(reason.message) }
        finally { setBusy('') }
      }
      async function loadLogs(name) {
        try { const result = await request('logs?name=' + encodeURIComponent(name)); setLogs(current => ({ ...current, [name]: result.text || t('暂无日志', 'No output yet') })) }
        catch (reason) { setError(reason.message) }
      }
      async function getPrompt() {
        if (prompt) return prompt
        const result = await request('prompt?lang=' + (language.active.startsWith('en') ? 'en' : 'zh'))
        setPrompt(result.prompt)
        return result.prompt
      }
      async function promptAction(copying) {
        try {
          if (!copying && showPrompt) { setShowPrompt(false); return }
          const text = await getPrompt()
          if (copying) { await copy(text); setCopied(true) }
          else setShowPrompt(true)
        } catch (reason) { setError(reason.message) }
      }
      const selected = services?.find(service => service.name === selectedName)
      const toggle = service => h('button', {
        className: 'ls-switch', type: 'button', role: 'switch', 'aria-checked': active(service),
        'aria-label': service.name + t(' 启停', ' start/stop'),
        title: active(service) ? t('停止', 'Stop') : t('启动', 'Start'), disabled: !!busy,
        onClick: () => action(active(service) ? 'stop' : 'start', service),
      }, h('span', { className: 'ls-thumb' }))
      const open = service => { setSelectedName(service.name); setDetailTab('overview') }
      const toolbar = h('div', { className: 'ls-toolbar' },
        settings || selected ? h('div', { className: 'ls-back' },
          button('back', settings && selected ? t('返回服务详情', 'Back to service') : t('返回服务列表', 'Back to services'), () => settings ? setSettings(false) : setSelectedName('')),
          h('span', null, settings ? t('设置', 'Settings') : t('服务详情', 'Service details'))) : null,
        !settings ? [
          button('refresh', t('刷新', 'Refresh'), () => { setError(''); refresh(); if (selected && detailTab === 'logs') loadLogs(selected.name) }, !!busy),
          !selected ? button('play', t('全部启动', 'Start all'), () => action('start-all'), !!busy || !services?.length) : null,
          !selected ? button('stop', t('全部停止', 'Stop all'), () => action('stop-all'), !!busy || !services?.length) : null,
        ] : null,
        button('settings', t('设置', 'Settings'), () => { setSettings(value => !value); setShowPrompt(false); setCopied(false) }))
      const rows = services?.map(service => h('section', { className: 'ls-service', key: service.name },
        h('button', { type: 'button', className: 'ls-open', 'aria-label': service.name + t(' 详情', ' details'), onClick: () => open(service) },
          h('span', { className: 'ls-name' }, service.name)),
        h('button', { type: 'button', className: 'ls-subtitle ls-autostart', 'data-autostart': service.autoStart,
          'aria-label': service.name + t(' 自启', ' autostart'), 'aria-pressed': service.autoStart, disabled: !!busy,
          title: service.autoStart ? t('关闭自启', 'Disable autostart') : t('开启自启', 'Enable autostart'),
          onClick: () => action('autostart', service, !service.autoStart) },
          icon(service.autoStart ? 'auto' : 'play'), service.autoStart ? t('自启', 'Auto') : t('手动', 'Manual')),
        toggle(service)))
      let details
      if (selected) {
        const state = ({ running: t('运行中', 'Running'), starting: t('启动中', 'Starting'), stopping: t('停止中', 'Stopping'), stopped: t('已停止', 'Stopped'), exited: t('已退出', 'Exited'), failed: t('失败', 'Failed') })[selected.status]
        const field = (label, value) => h('div', { key: label }, h('dt', null, label), h('dd', null, value))
        details = h('div', { className: 'ls-details' },
          h('div', { className: 'ls-heading' }, h('span', { className: 'ls-name' }, selected.name), toggle(selected)),
          h('div', { className: 'ls-tabs', 'data-active': detailTab, role: 'tablist', 'aria-label': t('服务详情', 'Service details') },
            ...[['overview', t('概览', 'Overview')], ['logs', t('日志', 'Logs')]].map(([id, label]) => h('button', {
              key: id, type: 'button', className: 'ls-tab', role: 'tab', 'aria-selected': detailTab === id,
              id: 'ls-tab-' + id, 'aria-controls': 'ls-detail-content', onClick: () => setDetailTab(id),
            }, label))),
          h('div', { id: 'ls-detail-content', className: detailTab === 'logs' ? 'ls-log-content' : undefined, role: 'tabpanel', 'aria-labelledby': 'ls-tab-' + detailTab },
            detailTab === 'logs'
              ? h('pre', { className: 'ls-log', tabIndex: 0, 'aria-label': t('日志输出', 'Log output') }, logs[selected.name] ?? t('正在加载日志…', 'Loading logs…'))
              : h('div', null,
                h('dl', null,
                  field(t('状态', 'Status'), state),
                  field(t('进程 ID', 'Process ID'), selected.pid ?? '—'),
                  selected.url ? field(t('访问地址', 'URL'), h('span', null, selected.url,
                    button('copy', t('复制地址', 'Copy URL'), async () => { try { await copy(selected.url) } catch (reason) { setError(reason.message) } }))) : null,
                  field(t('工作目录', 'Working directory'), selected.cwd),
                  field(t('启动命令', 'Command'), h('pre', null, selected.argv.map(arg => JSON.stringify(arg)).join(' '))),
                  selected.error ? field(t('错误', 'Error'), selected.error)
                    : selected.exitCode !== null ? field(t('退出码', 'Exit code'), selected.exitCode) : null),
                h('label', null, h('input', { type: 'checkbox', checked: selected.autoStart, disabled: !!busy,
                  onChange: event => action('autostart', selected, event.target.checked) }), t('随引擎启动', 'Start with engine')),
                h('div', { className: 'ls-detail-actions' },
                  h('button', { type: 'button', className: 'ls-text-button', disabled: !!busy, onClick: () => action('restart', selected) }, icon('refresh'), t('重启', 'Restart')),
                  h('button', { type: 'button', className: 'ls-text-button', disabled: !!busy || active(selected),
                    title: active(selected) ? t('请先停止服务', 'Stop the service first') : undefined,
                    onClick: () => action('remove', selected) }, icon('trash'), t('移除', 'Remove'))))))
      }
      return h('section', { className: 'dsh-ha-services' + (!settings && selected && detailTab === 'logs' ? ' ls-log-view' : ''), 'data-dsh-adapt': 'off', 'aria-label': title() },
        h('style', null, css), toolbar,
        error ? h('div', { className: 'ls-error', role: 'alert' }, h('span', null, error), button('close', t('关闭提示', 'Dismiss'), () => setError(''))) : null,
        settings ? h('div', { className: 'ls-settings' },
          h('div', { className: 'ls-settings-actions' },
            h('button', { type: 'button', className: 'ls-text-button', onClick: () => promptAction(false) }, showPrompt ? t('收起提示词', 'Hide prompt') : t('显示提示词', 'Show prompt')),
            h('button', { type: 'button', className: 'ls-text-button', onClick: () => promptAction(true) }, copied ? t('已复制', 'Copied') : t('复制提示词', 'Copy prompt'))),
          showPrompt ? h('pre', { className: 'ls-prompt' }, prompt) : null)
          : selected ? details
            : services === null ? h('div', { className: 'ls-empty' }, t('正在加载…', 'Loading…'))
              : services.length ? rows : h('div', { className: 'ls-empty' }, t('暂无服务', 'No services yet')))
    }
    return {
      name: NAME,
      inject: ['slots', 'locale'],
      apply(ctx) {
        locale = ctx.get('locale')
        ctx.inject(['sidebarRightTabs'], inner => inner.effect(() => inner.get('sidebarRightTabs').register({
          id: TAB, kind: 'local-services', priority: 'extension', title,
          guide: [{ id: 'local-services', order: 900, title }],
        })))
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB }, Panel))
        ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB }, () => h('span', null, title())))
      },
    }
  },
})
