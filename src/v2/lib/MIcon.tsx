/* Material Symbols 아이콘 — UI 컨트롤(닫기·화살표·검색 등)은 문자/이모지 대신 이걸 쓴다.
   이름은 https://fonts.google.com/icons 의 아이콘 이름 그대로 (예: close, expand_more, search) */

export function MIcon({
  name,
  size = 18,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size, lineHeight: 1, verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
