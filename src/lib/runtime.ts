/** True when built for GitHub Pages (`BASE_PATH=/Telokine/`). */
export function isGitHubPages(): boolean {
  return import.meta.env.BASE_URL !== '/'
}
