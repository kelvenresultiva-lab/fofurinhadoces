import Image from 'next/image'

// Logo da Fofurinha Doces nas telas públicas (login, cadastro, nova senha).
export function LogoMarca() {
  return (
    <div className="mb-6 flex justify-center">
      <Image src="/logo-fofurinha.webp" alt="Fofurinha Doces" width={560} height={604} priority className="h-auto w-36" />
    </div>
  )
}
