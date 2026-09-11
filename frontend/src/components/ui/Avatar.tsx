import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  photoUrl?: string;
  size?: number;
  className?: string;
}

/** Initials on coral, or a photo when one exists. Decorative — the name is always
    shown in text nearby, so this is aria-hidden. */
export function Avatar({ name, photoUrl, size = 46, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center overflow-hidden rounded-full bg-mhl-accent font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
