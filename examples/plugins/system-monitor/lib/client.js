window.__ModuleLoader__.load({
  id: 'system-monitor',
  factory: require => {
    const { createElement: h, useEffect, useState, useSyncExternalStore } = require('react')
    const TAB = 'system-monitor:overview'
    let locale
    const t = (zh, en) => locale.resolveText({ zh, en })
    const title = () => t('系统监控', 'System monitor')
    const bytes = value => {
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
      const index = Math.min(4, Math.max(0, Math.floor(Math.log2(Math.max(1, value)) / 10)))
      return (value / 1024 ** index).toFixed(index < 2 ? 0 : 1) + ' ' + units[index]
    }
    const percent = value => value === null || value === undefined ? '—' : value.toFixed(1) + '%'
    const css = `
      .dsh-monitor{box-sizing:border-box;height:100%;overflow:auto;padding:10px 16px;font:16px/1.55 system-ui,sans-serif;color:var(--dsw-alias-label-primary,#dce1eb)}
      .dsh-monitor *{box-sizing:border-box}.dsh-monitor button{font:inherit;color:inherit;cursor:pointer;border:0;-webkit-tap-highlight-color:transparent;transition:background-color .16s ease,box-shadow .16s ease}
      .dsh-monitor button:disabled{opacity:.4;cursor:default}.dsh-monitor button:focus{outline:none}
      .dsh-monitor button:focus-visible{box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary,#929dad);background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}
      .dsh-monitor .sm-toolbar{display:flex;justify-content:flex-end;padding-bottom:8px}
      .dsh-monitor .sm-refresh{display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;padding:10px;border-radius:10px;background:transparent;color:var(--dsw-alias-menu-icon,var(--dsw-alias-label-secondary,#aeb8c8))}
      .dsh-monitor .sm-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
      .dsh-monitor .sm-metric{padding:4px 0 12px;min-width:0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-monitor .sm-metric:last-child{grid-column:1/-1}.dsh-monitor .sm-value{font-size:24px;font-weight:500;margin:4px 0;line-height:1.4}
      .dsh-monitor .sm-track{height:4px;border-radius:2px;background:var(--dsw-alias-interactive-bg-hover,#ffffff14);overflow:hidden;margin:10px 0}
      .dsh-monitor .sm-track span{display:block;height:100%;background:var(--dsw-alias-brand-primary,#829beb);border-radius:inherit;transition:width .2s ease}
      .dsh-monitor .sm-usage{color:var(--dsw-alias-label-secondary,#aeb8c8)}
      .dsh-monitor h3{font:500 16px/1.5 system-ui,sans-serif;margin:20px 0 8px}.dsh-monitor p{margin:12px 0}
      .dsh-monitor .sm-row{display:grid;grid-template-columns:minmax(0,1fr) 6ch 9ch;align-items:center;gap:12px;min-height:48px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff16)}
      .dsh-monitor .sm-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-monitor .sm-reading{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .dsh-monitor .sm-column{display:inline-flex;align-items:center;justify-content:flex-end;gap:4px;padding:6px 8px;border-radius:8px;background:transparent;white-space:nowrap;font-weight:500}
      .dsh-monitor .sm-column[aria-pressed=true]{font-weight:600}.dsh-monitor .sm-error{color:var(--dsw-alias-state-error-primary,#ef9494);padding:8px 0}
      .dsh-monitor button:active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}
      @media(hover:hover){.dsh-monitor button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,#ffffff14)}.dsh-monitor button:active:enabled{background:var(--dsw-alias-interactive-bg-active,#ffffff24)}}
      @media(prefers-reduced-motion:reduce){.dsh-monitor button,.dsh-monitor .sm-track span{transition:none}}
    `
    function Panel() {
      useSyncExternalStore(callback => locale.subscribe(callback), () => locale.getSnapshot())
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [revision, setRevision] = useState(0)
      const [sort, setSort] = useState('cpu')
      useEffect(() => {
        let mounted = true, timer
        const poll = async () => {
          if (mounted) setBusy(true)
          try {
            const response = await fetch('/system-monitor/v1/resources', { credentials: 'same-origin' })
            if (!response.ok) throw Error('HTTP ' + response.status)
            const result = await response.json()
            if (mounted) { setData(result); setError('') }
          } catch (reason) { if (mounted) setError(reason.message) }
          finally { if (mounted) { setBusy(false); timer = setTimeout(poll, 2000) } }
        }
        poll()
        return () => { mounted = false; clearTimeout(timer) }
      }, [revision])
      const metric = (name, value, hint, ratio, usage) => h('div', { className: 'sm-metric', key: name, title: hint },
        h('div', null, name), h('div', { className: 'sm-value' }, value),
        ratio === null ? null : h('div', { className: 'sm-track', 'aria-hidden': true }, h('span', { style: { width: Math.min(100, Math.max(0, ratio)) + '%' } })),
        usage ? h('div', { className: 'sm-usage' }, usage) : null)
      const column = (id, label) => h('button', { type: 'button', className: 'sm-column', 'aria-label': id === 'cpu' ? t('按 CPU 排序', 'Sort by CPU') : t('按内存排序', 'Sort by memory'), 'aria-pressed': sort === id, onClick: () => setSort(id) }, label, sort === id ? h('span', { 'aria-hidden': true }, '↓') : null)
      let body
      if (data) {
        const { memory, disk, issues, processes } = data
        const restricted = issues.some(issue => issue.area === 'cpu')
        const cpu = restricted ? data.processCpu : data.cpu
        const rows = [...processes].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || b.memory - a.memory).slice(0, 12)
        body = h('div', null,
          h('div', { className: 'sm-cards' },
            metric('CPU', percent(cpu), restricted ? t('Ubuntu 进程占用，单核 100%', 'Ubuntu process usage, 100% per core') : data.cores + t(' 个可用逻辑核', ' available logical cores'), cpu === null ? null : cpu / (restricted ? data.cores : 1)),
            metric(t('内存', 'Memory'), memory ? percent(memory.used / memory.total * 100) : '—', t('设备内存：已用 / 总计', 'Device memory: used / total'), memory ? memory.used / memory.total * 100 : null, memory ? bytes(memory.used) + ' / ' + bytes(memory.total) : null),
            metric(t('存储', 'Storage'), disk ? bytes(disk.available) + t(' 可用', ' free') : '—', disk ? t('Ubuntu 所在分区，已用 / 总计：', 'Ubuntu filesystem, used / total: ') + bytes(disk.used) + ' / ' + bytes(disk.total) : t('无法读取存储', 'Storage unavailable'), disk ? disk.used / disk.total * 100 : null)),
          h('h3', null, t('进程', 'Processes')),
          h('div', { className: 'sm-row' }, h('span', null, t('名称', 'Name')), column('cpu', 'CPU'), column('memory', t('内存', 'Memory'))),
          rows.map(row => h('div', { className: 'sm-row sm-process', key: row.pid, title: 'PID ' + row.pid },
            h('span', { className: 'sm-main', title: row.name + ' · PID ' + row.pid }, row.name),
            h('span', { className: 'sm-reading', title: t('单核 100%', '100% per core') }, percent(row.cpu)),
            h('span', { className: 'sm-reading', title: 'RSS' }, bytes(row.memory)))),
          rows.length ? null : h('p', null, issues.some(issue => issue.area === 'processes') ? t('无法读取进程', 'Processes unavailable') : t('暂无进程', 'No processes')))
      }
      return h('section', { className: 'dsh-monitor', 'data-dsh-adapt': 'off', 'aria-label': title() }, h('style', null, css),
        h('div', { className: 'sm-toolbar' },
          h('button', { type: 'button', className: 'sm-refresh', 'aria-label': t('刷新', 'Refresh'), title: t('刷新', 'Refresh'), disabled: busy, onClick: () => setRevision(value => value + 1) },
            h('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1' })))),
        error ? h('div', { className: 'sm-error', role: 'alert', title: error }, data ? t('刷新失败，当前为上次数据', 'Refresh failed; showing previous data') : t('刷新失败，请重试', 'Refresh failed. Try again.')) : null,
        body ?? (error ? null : h('p', null, t('正在读取…', 'Loading…'))))
    }
    return { name: 'system-monitor', inject: ['slots', 'locale'], apply(ctx) {
      locale = ctx.get('locale')
      ctx.inject(['sidebarRightTabs'], inner => inner.effect(() => inner.get('sidebarRightTabs').register({ id: TAB, kind: 'system-monitor', priority: 'extension', title, guide: [{ id: 'system-monitor', order: 910, title }] })))
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB }, Panel))
      ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB }, () => h('span', null, title())))
    } }
  },
})
