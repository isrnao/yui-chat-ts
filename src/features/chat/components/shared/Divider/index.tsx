export default function Divider() {
  return (
    <hr
      className="border-0 border-t-2 border-b border-t-[var(--ie-gray)] border-b-white h-0 my-2"
      style={{
        width: 'calc(100% + (var(--page-gap, 0px) * 2))',
        marginInline: 'calc(var(--page-gap, 0px) * -1)',
      }}
    />
  );
}
