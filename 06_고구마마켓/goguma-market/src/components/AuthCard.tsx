import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";

// 로그인/회원가입 화면을 감싸는 포대자루 카드
export default function AuthCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: { text: string; href: string; link: string };
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <div className="card-sack px-6 pb-8 pt-12 sm:px-8">
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-full border-2 border-soil bg-flesh-soft p-2">
          <GogumaLogo size={52} />
        </div>
        <h1 className="text-center font-display text-3xl">{title}</h1>
        <p className="mt-1 text-center text-sm text-soil-soft">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </div>
      <p className="mt-6 text-center text-sm text-soil-soft">
        {footer.text}{" "}
        <Link href={footer.href} className="font-display text-skin underline decoration-wavy underline-offset-4">
          {footer.link}
        </Link>
      </p>
    </div>
  );
}
