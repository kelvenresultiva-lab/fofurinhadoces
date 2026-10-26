import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Endereço público usado nas prévias de link (WhatsApp, redes sociais), que exigem URL absoluta da
// imagem. Na Vercel vem de VERCEL_PROJECT_PRODUCTION_URL (variável de sistema); localmente, localhost.
const urlDoSite = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const descricao = "Gestão de clientes, orçamentos e contratos da Fofurinha Doces";

// A imagem da prévia (logo sobre fundo branco) vem de app/opengraph-image.jpg e o ícone de
// app/icon.png / app/apple-icon.png, pela convenção de arquivos do Next.
export const metadata: Metadata = {
  metadataBase: new URL(urlDoSite),
  title: "Fofurinha Doces",
  description: descricao,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Fofurinha Doces",
    title: "Fofurinha Doces",
    description: descricao,
  },
  twitter: {
    card: "summary_large_image",
    title: "Fofurinha Doces",
    description: descricao,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
