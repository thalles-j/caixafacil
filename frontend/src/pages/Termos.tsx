import { Link } from 'react-router-dom';

export default function Termos() {
  return <main className="mx-auto max-w-3xl space-y-5 px-6 py-10 text-ink">
    <Link to="/login" className="text-sm underline">Voltar ao acesso</Link>
    <h1 className="text-3xl font-bold">Termos de Uso</h1>
    <p role="note" className="rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">Rascunho técnico — versão 2026-09-05.1. Este texto precisa de revisão jurídica antes da publicação como termos definitivos.</p>
    <h2 className="text-xl font-semibold">Uso do CaixaFácil</h2>
    <p>O CaixaFácil auxilia estabelecimentos no registro de vendas, estoque, caixa e valores a receber. Os comprovantes emitidos são não fiscais e não substituem documentos fiscais exigidos para a atividade do estabelecimento.</p>
    <h2 className="text-xl font-semibold">Responsabilidades de acesso</h2>
    <p>O responsável pelo estabelecimento administra sua conta e os operadores autorizados. Cada pessoa deve usar sua própria credencial, manter a senha protegida e comunicar acessos indevidos. Operadores possuem permissões limitadas à operação do caixa.</p>
    <h2 className="text-xl font-semibold">Dados de clientes e cobranças</h2>
    <p>O estabelecimento deve informar seus clientes sobre o tratamento de seus dados e atender solicitações de privacidade. A autorização de contato por WhatsApp é opcional e pode ser revogada; o uso da cobrança integrada exige seu registro explícito. É proibido usar o serviço para envio abusivo ou divulgação indevida de dados.</p>
    <h2 className="text-xl font-semibold">Continuidade e conferência</h2>
    <p>O estabelecimento deve conferir os registros financeiros e acompanhar vendas pendentes de sincronização. Funcionalidades que dependem de rede, navegador, impressora ou serviços externos podem ficar temporariamente indisponíveis. Backups exportados ficam sob a guarda do estabelecimento.</p>
    <h2 className="text-xl font-semibold">Definições pendentes para a publicação</h2>
    <p>A identificação jurídica do fornecedor, contatos de suporte e privacidade, condições comerciais, responsabilidades contratuais, prazos de retenção e resolução de disputas devem ser definidos pelo responsável pelo serviço e revisados juridicamente.</p>
    <Link to="/privacidade" className="inline-block underline">Política de Privacidade</Link>
  </main>;
}
