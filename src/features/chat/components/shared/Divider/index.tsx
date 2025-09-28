type DividerProps = {
  className?: string;
};

export default function Divider({ className = '' }: DividerProps = {}) {
  return (
    <hr
      className={`bleed-x border-0 border-t-2 border-b border-t-ie-gray border-b-white h-0 my-2 ${className}`.trim()}
    />
  );
}
