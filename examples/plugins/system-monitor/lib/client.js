window.__ModuleLoader__.load({
  id: 'system-monitor',
  factory: require => {
    const { createElement: h, useEffect, useState, useSyncExternalStore } = require('react')
    const TAB = 'system-monitor:overview'
    let locale
    const t = (zh, en) => locale.resolveText({ zh, en })
    const title = () => t('系统监控', 'System monitor')
    const bytes = value => {
      if (value === null || value === undefined) return '—'
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
      const index = Math.min(4, Math.max(0, Math.floor(Math.log2(Math.max(1, value)) / 10)))
      return (value / 1024 ** index).toFixed(index < 2 ? 0 : 1) + ' ' + units[index]
    }
    const percent = value => value === null || value === undefined ? '—' : value.toFixed(1) + '%'
    const address = row => (row.address.includes(':') && !row.address.startsWith('[') ? '[' + row.address + ']' : row.address) + ':' + row.port
    const css = `
      .dsh-monitor{box-sizing:border-box;height:100%;overflow:auto;padding:10px 16px;font:16px/1.55 system-ui,sans-serif;color:var(--dsw-alias-label-primary,#dce1eb)}
      .dsh-monitor *{box-sizing:border-box}.dsh-monitor button,.dsh-monitor input{font:inherit;color:inherit}
      .dsh-monitor button{cursor:pointer;border:0;-webkit-tap-highlight-color:transparent;transition:background-color .16s ease,box-shadow .16s ease}
      .dsh-monitor button:disabled{opacity:.4;cursor:default}.dsh-monitor button:focus{outline:none}
      .dsh-monitor button:focus-visible,.dsh-monitor input:focus{outline:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary,#929dad)}
      .dsh-monitor .sm-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px}
      .dsh-monitor .sm-muted{font-size:14px;color:var(--dsw-alias-label-tertiary,#929dad)}
      .dsh-monitor .sm-refresh{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;padding:10px;border-radius:10px;background:transparent;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary,#aeb8c8))}
      .dsh-monitor .sm-tabs{position:relative;isolation:isolate;display:flex;flex:none;height:40px;padding:4px;margin-bottom:16px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
      .dsh-monitor .sm-tabs:before{content:'';position:absolute;z-index:-1;left:4px;top:4px;bottom:4px;width:calc((100% - 8px)/2);border-radius:999px;background:var(--dsw-alias-interactive-bg-active,#ffffff24);transition:transform .2s ease}
      .dsh-monitor .sm-tabs[data-active=ports]:before{transform:translateX(100%)}
      .dsh-monitor .sm-tab{flex:1;min-width:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#aeb8c8);font-size:15px;padding:0 12px}
      .dsh-monitor .sm-tab[aria-selected=true]{color:var(--dsw-alias-label-primary,#dce1eb);font-weight:600}
      .dsh-monitor .sm-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
      .dsh-monitor .sm-metric{padding:4px 0 16px;min-width:0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-monitor .sm-metric:last-child{grid-column:1/-1}.dsh-monitor .sm-value{font-size:24px;font-weight:500;margin:4px 0;line-height:1.4}
      .dsh-monitor .sm-track{height:4px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);overflow:hidden;margin:10px 0}
      .dsh-monitor .sm-track span{display:block;height:100%;background:var(--dsw-alias-brand-primary,#829beb);border-radius:inherit;transition:width .2s ease}
      .dsh-monitor h3{font:500 16px/1.5 system-ui,sans-serif;margin:20px 0 8px}.dsh-monitor p{margin:8px 0 16px}
      .dsh-monitor .sm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:58px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-monitor .sm-main{min-width:0;overflow-wrap:anywhere}.dsh-monitor .sm-reading{text-align:right;flex:none;font-variant-numeric:tabular-nums}
      .dsh-monitor .sm-address{font:15px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}.dsh-monitor .sm-search{width:100%;padding:10px 12px;margin:0 0 10px;border:1px solid var(--dsw-alias-border-l2,#ffffff16);border-radius:10px;background:transparent}
      .dsh-monitor .sm-sort{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:20px}.dsh-monitor .sm-sort h3{margin:0}.dsh-monitor .sm-sort button{padding:6px 10px;background:transparent;border-radius:8px;font-size:14px;color:var(--dsw-alias-label-secondary,#aeb8c8)}
      .dsh-monitor .sm-note{font-size:14px;color:var(--dsw-alias-label-tertiary,#929dad);padding:10px 0}.dsh-monitor .sm-error{color:var(--dsw-alias-state-error-primary,#ef9494);font-size:14px;padding:8px 0}
      .dsh-monitor button:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
      .dsh-monitor button:active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}
      @media(hover:hover){.dsh-monitor button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}.dsh-monitor button:active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}}
      @media(prefers-reduced-motion:reduce){.dsh-monitor button,.dsh-monitor .sm-tabs:before,.dsh-monitor .sm-track span{transition:none}}
    `
    function Panel() {
      useSyncExternalStore(callback => locale.subscribe(callback), () => locale.getSnapshot())
      const [tab, setTab] = useState('resources')
      const [data, setData] = useState({})
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [revision, setRevision] = useState(0)
      const [query, setQuery] = useState('')
      const [sort, setSort] = useState('cpu')
      useEffect(() => {
        let mounted = true, timer
        const poll = async () => {
          if (mounted) setBusy(true)
          try {
            const response = await fetch('/system-monitor/v1/' + tab, { credentials: 'same-origin' })
            if (!response.ok) throw Error('HTTP ' + response.status)
            const result = await response.json()
            if (mounted) { setData(current => ({ ...current, [tab]: result })); setError('') }
          } catch (reason) { if (mounted) setError(reason.message) }
          finally { if (mounted) { setBusy(false); timer = setTimeout(poll, tab === 'ports' ? 5000 : 2000) } }
        }
        poll()
        return () => { mounted = false; clearTimeout(timer) }
      }, [tab, revision])
      const current = data[tab]
      const metric = (name, value, caption, ratio) => h('div', { className: 'sm-metric', key: name },
        h('div', null, name), h('div', { className: 'sm-value' }, value),
        ratio === null ? null : h('div', { className: 'sm-track', 'aria-hidden': true }, h('span', { style: { width: Math.min(100, Math.max(0, ratio)) + '%' } })),
        h('div', { className: 'sm-muted' }, caption))
      let body
      if (current && tab === 'resources') {
        const { memory, disk, issues, processes } = current
        const restricted = issues.some(issue => issue.area === 'cpu')
        const cpu = restricted ? current.processCpu : current.cpu
        const rows = [...processes].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || b.memory - a.memory).slice(0, 12)
        body = h('div', null,
          h('div', { className: 'sm-cards' },
            metric(restricted ? t('Ubuntu CPU', 'Ubuntu CPU') : 'CPU', percent(cpu),
              restricted ? t('可见进程 · 单核 100%', 'Visible processes · 100% per core') : current.cores + t(' 个可用逻辑核', ' available logical cores'), cpu === null ? null : cpu / (restricted ? current.cores : 1)),
            metric(t('内存', 'Memory'), memory ? percent(memory.used / memory.total * 100) : '—', memory ? bytes(memory.used) + ' / ' + bytes(memory.total) : t('无法读取', 'Unavailable'), memory ? memory.used / memory.total * 100 : null),
            metric(t('存储', 'Storage'), disk ? bytes(disk.available) + t(' 可用', ' free') : '—', disk ? bytes(disk.used) + ' / ' + bytes(disk.total) + t(' · Ubuntu 所在分区', ' · Ubuntu filesystem') : t('无法读取', 'Unavailable'), disk ? disk.used / disk.total * 100 : null)),
          restricted ? h('div', { className: 'sm-note' }, t('系统 CPU 读取受限，仅统计 Ubuntu 可见进程。内存为可读取的设备总内存。', 'System CPU is restricted; CPU covers visible Ubuntu processes. Memory is the readable device total.')) : null,
          h('div', { className: 'sm-sort' }, h('h3', null, t('可见进程', 'Visible processes')),
            h('button', { type: 'button', onClick: () => setSort(value => value === 'cpu' ? 'memory' : 'cpu'), 'aria-label': t('切换进程排序', 'Change process sort') }, sort === 'cpu' ? t('按 CPU', 'By CPU') : t('按内存', 'By memory'))),
          rows.map(row => h('div', { className: 'sm-row', key: row.pid },
            h('div', { className: 'sm-main' }, row.name, h('div', { className: 'sm-muted' }, 'PID ' + row.pid)),
            h('div', { className: 'sm-reading' }, percent(row.cpu), h('div', { className: 'sm-muted' }, bytes(row.memory))))),
          h('div', { className: 'sm-note' }, processes.length + t(' 个可见进程 · CPU 单核 100% · RSS 内存', ' visible processes · CPU 100% per core · RSS memory'),
            current.hidden ? ' · ' + current.hidden + t(' 个进程无读取权限', ' processes inaccessible') : '',
            issues.some(issue => issue.area === 'processes' || issue.area === 'processCpu') ? t(' · 进程数据读取受限', ' · Process metrics restricted') : ''),
          cpu === null && !issues.some(issue => issue.area === 'processCpu' || issue.area === 'processes') ? h('div', { className: 'sm-muted' }, t('正在采样 CPU…', 'Sampling CPU…')) : null)
      } else if (current) {
        const needle = query.trim().toLowerCase()
        const matches = row => [row.address, row.port, row.protocol ?? '', row.name ?? '', ...(row.owners ?? []).flatMap(owner => [owner.name, owner.pid])].join(' ').toLowerCase().includes(needle)
        const sockets = current.sockets.filter(matches), registered = current.registered.filter(matches)
        body = h('div', null,
          h('input', { className: 'sm-search', type: 'search', value: query, placeholder: t('搜索端口、地址或进程', 'Search port, address or process'), 'aria-label': t('搜索端口', 'Search ports'), onChange: event => setQuery(event.target.value) }),
          !current.available ? h('p', { className: 'sm-note' }, t('当前环境未开放端口表，无法枚举实际监听端口。', 'This environment restricts socket tables; actual listening ports cannot be enumerated.'))
            : h('div', null, h('h3', null, t('实际监听端口', 'Detected listening ports')),
              current.partial || current.hidden ? h('p', { className: 'sm-note' }, t('部分端口或进程信息没有读取权限。', 'Some socket or process information is inaccessible.')) : null,
              sockets.length ? sockets.map((row, index) => h('div', { className: 'sm-row', key: index },
                h('div', { className: 'sm-main' }, h('div', { className: 'sm-address' }, address(row)),
                  h('div', { className: 'sm-muted' }, row.owners.length ? row.owners.map(owner => owner.name + ' · PID ' + owner.pid).join(', ') : t('进程不可见', 'Owner not visible'))),
                h('div', { className: 'sm-muted' }, row.protocol))) : h('p', { className: 'sm-note' }, needle ? t('没有匹配的端口', 'No matching ports') : t('未检测到 TCP 监听或 UDP 绑定端口', 'No TCP listeners or bound UDP ports detected'))),
          current.registered.length ? h('div', null, h('h3', null, t('已登记地址', 'Registered addresses')),
            h('p', { className: 'sm-muted' }, t('来自服务管理配置，不代表正在监听。', 'From Services configuration; these are not confirmed listeners.')),
            registered.map(row => h('div', { className: 'sm-row', key: row.name }, h('div', { className: 'sm-main' }, row.name), h('div', { className: 'sm-address' }, address(row))))) : null,
          current.registryIssue ? h('p', { className: 'sm-error' }, t('无法读取已登记的服务地址。', 'Unable to read registered service addresses.')) : null)
      }
      return h('section', { className: 'dsh-monitor', 'data-dsh-adapt': 'off', 'aria-label': title() }, h('style', null, css),
        h('div', { className: 'sm-toolbar' }, h('span', { className: 'sm-muted', title: current?.sampledAt }, tab === 'resources' ? t('每 2 秒更新', 'Updates every 2 seconds') : t('每 5 秒更新', 'Updates every 5 seconds')),
          h('button', { type: 'button', className: 'sm-refresh', 'aria-label': t('刷新', 'Refresh'), title: t('刷新', 'Refresh'), disabled: busy, onClick: () => setRevision(value => value + 1) },
            h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1' })))),
        h('div', { className: 'sm-tabs', 'data-active': tab, role: 'tablist', 'aria-label': title() },
          ...[['resources', t('资源', 'Resources')], ['ports', t('端口', 'Ports')]].map(([id, label]) => h('button', { key: id, type: 'button', className: 'sm-tab', id: 'sm-tab-' + id, role: 'tab', 'aria-selected': tab === id, 'aria-controls': 'sm-content', onClick: () => setTab(id) }, label))),
        error ? h('div', { className: 'sm-error', role: 'alert' }, t('刷新失败，请重试。', 'Refresh failed. Try again.') + ' (' + error + ')' + (current ? t(' · 显示上次数据', ' · Showing previous data') : '')) : null,
        h('div', { id: 'sm-content', role: 'tabpanel', 'aria-labelledby': 'sm-tab-' + tab }, body ?? h('p', { className: 'sm-note' }, error ? t('暂无数据', 'No data') : t('正在读取…', 'Loading…'))))
    }
    return { name: 'system-monitor', inject: ['slots', 'locale'], apply(ctx) {
      locale = ctx.get('locale')
      ctx.inject(['sidebarRightTabs'], inner => inner.effect(() => inner.get('sidebarRightTabs').register({ id: TAB, kind: 'system-monitor', priority: 'extension', title, guide: [{ id: 'system-monitor', order: 910, title }] })))
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB }, Panel))
      ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB }, () => h('span', null, title())))
    } }
  },
})
