import { Link } from 'react-router-dom';

export default function Privacidade() {
  return <main className="mx-auto max-w-3xl space-y-5 px-6 py-10 text-ink">
    <Link to="/login" className="text-sm underline">Voltar ao acesso</Link>
    <h1 className="text-3xl font-bold">Política de Privacidade</h1>
    <p role="note" className="rounded-xl border border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">Rascunho técnico — versão 2026-09-05.1. Requer revisão jurídica e preenchimento dos responsáveis e canais de contato antes da publicação como política definitiva.</p>
    <h2 className="text-xl font-semibold">Dados e finalidades</h2>
    <p>O sistema armazena dados de acesso de responsáveis e operadores, dados do estabelecimento, registros de caixa e vendas e dados de clientes informados pelo estabelecimento. Esses dados permitem operar o serviço, controlar recebimentos e apurar movimentações. Senhas são armazenadas como hash.</p>
    <h2 className="text-xl font-semibold">Contato por WhatsApp</h2>
    <p>O telefone só é utilizado pela função integrada de cobrança após autorização explícita e versionada, registrada pelo responsável ou operador. A autorização não é requisito para comprar. O cliente pode solicitar sua revogação ao estabelecimento gratuitamente. Ao abrir a cobrança, o WhatsApp recebe os dados necessários à mensagem, sujeitos também às condições daquele serviço.</p>
    <h2 className="text-xl font-semibold">Direitos dos clientes</h2>
    <p>O cliente pode pedir ao estabelecimento informações sobre o uso de seus dados, acesso, correção, revogação do consentimento e análise de eliminação ou anonimização. O responsável verifica a identidade do solicitante antes de atender o pedido, para proteger os dados de outras pessoas.</p>
    <p>A função de anonimização remove nome, telefone, e-mail, observações do cadastro e descrições financeiras vinculadas. Valores, datas e registros financeiros são preservados para conferência. Os responsáveis devem avaliar a necessidade de retenção e o risco de identificação indireta conforme o caso.</p>
    <h2 className="text-xl font-semibold">Armazenamento e proteção</h2>
    <p>Os dados são segregados por estabelecimento no banco. O serviço usa autenticação, restrição de permissões e auditoria de ações sensíveis. Vendas realizadas sem conexão podem permanecer no dispositivo até a sincronização. Cópias já exportadas ou impressas exigem tratamento pelo estabelecimento e não são apagadas remotamente.</p>
    <h2 className="text-xl font-semibold">Fornecedores, retenção e contato</h2>
    <p>Antes da publicação definitiva, o responsável pelo serviço deve informar sua identificação, o canal de privacidade, os fornecedores efetivamente contratados, eventuais transferências internacionais, bases legais por finalidade e prazos de retenção, inclusive de backups e logs. Não são assumidos prazos de conservação indefinidos.</p>
    <p>Clientes finais devem procurar o estabelecimento com o qual compraram. Responsáveis e operadores devem procurar o canal de suporte contratado para assuntos de sua conta.</p>
    <Link to="/termos" className="inline-block underline">Termos de Uso</Link>
  </main>;
}
