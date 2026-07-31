type ReloadTarget = {
  reload: () => void
}

export function reloadPage(target: ReloadTarget = window.location) {
  target.reload()
}
