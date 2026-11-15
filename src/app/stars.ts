const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function starsHtml(id: string, title: string, stars: number, canWrite: boolean): string {
  const buttons = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="star" data-id="${escape(id)}" data-stars="${n}" aria-label="優先度 ${n}" aria-pressed="${n <= stars}"${canWrite ? "" : " disabled"}>${n <= stars ? "★" : "☆"}</button>`)
    .join("");
  return `<div class="stars" role="group" aria-label="${escape(title)}の優先度">${buttons}</div>`;
}
