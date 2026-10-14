import { avatarColor, initials } from "@/lib/utils";

export default function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.max(9, size * 0.38) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
