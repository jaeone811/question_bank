// 16x16 도트 로고 (돼지저금통 + 체크된 시험지). 원본 도트 맵은 legacy/index.html 주석 참고
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 18 18" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true">
      <rect x="-1" y="-1" width="18" height="18" fill="#141413"/>
      <path fill="#7c2d12" d="M3 4h2v1h-2zM3 5h1v1h-1zM5 5h1v1h-1zM11 5h2v1h-2zM2 6h1v1h-1zM13 6h1v1h-1zM1 7h1v1h-1zM14 7h1v1h-1zM0 8h1v1h-1zM14 8h2v1h-2zM0 9h1v1h-1zM14 9h1v1h-1zM0 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM2 12h1v1h-1zM13 12h1v1h-1zM3 13h10v1h-10zM3 14h1v1h-1zM5 14h1v1h-1zM10 14h1v1h-1zM12 14h1v1h-1zM3 15h3v1h-3zM10 15h3v1h-3z"/>
      <path fill="#facc15" d="M4 5h1v1h-1zM5 6h8v1h-8zM5 7h9v1h-9zM3 8h11v1h-11zM4 9h10v1h-10zM3 10h10v1h-10zM2 11h10v1h-10zM4 12h7v1h-7z"/>
      <path fill="#fef08a" d="M3 6h2v1h-2zM2 7h2v1h-2z"/>
      <path fill="#f59e0b" d="M1 8h2v1h-2zM2 9h1v1h-1zM1 10h2v1h-2zM13 10h1v1h-1zM12 11h2v1h-2zM3 12h1v1h-1zM11 12h2v1h-2zM4 14h1v1h-1zM11 14h1v1h-1z"/>
      <path fill="#b45309" d="M1 9h1v1h-1zM3 9h1v1h-1z"/>
      <path fill="#141413" d="M4 7h1v1h-1z"/>
      <path fill="#3f3f3a" d="M6 5h5v1h-5z"/>
      <path fill="#ffffff" d="M6 0h4v1h-4zM6 1h3v1h-3zM10 1h1v1h-1zM7 2h1v1h-1zM9 2h2v1h-2zM6 3h1v1h-1zM8 3h3v1h-3zM6 4h5v1h-5z"/>
      <path fill="#1d4ed8" d="M10 0h1v1h-1zM9 1h1v1h-1zM6 2h1v1h-1zM8 2h1v1h-1zM7 3h1v1h-1z"/>
    </svg>
  );
}
