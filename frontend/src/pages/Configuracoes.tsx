import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  DownloadSimple,
  EnvelopeSimple,
  Headset,
  Key,
  Moon,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  SignOut,
  Sun,
  Trash,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';
import { formatCurrency, parseMoney, sanitizeMoneyInput, todayISO } from '../lib/format';
import {
  ensureStoredAccessToken,
  exportAccountBackupRequest,
  restoreAccountBackupRequest,
  type AccountBackup,
} from '../lib/auth';
import { useDarkMode } from '../lib/theme';
import { RAMOS_ATUACAO } from '../types';
import type { FrequenciaRelatorio, Oferta, Recorrencia, ViewPeriod } from '../types';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { paginateItems } from '../lib/pagination';
import { sendReportEmailRequest } from '../lib/business';

export default function Configuracoes() {
  const { data, setConfig, resetData, cadastrarDespesaFixaNoBanco, removerDespesaFixaNoBanco } = useAppData();
  const config = data.config;
  const { user, logout, resetAccountData, changePassword } = useAuth();

  const [novaDespesaNome, setNovaDespesaNome] = useState('');
  const [novaDespesaValor, setNovaDespesaValor] = useState('');
  const [novaDespesaRecorrencia, setNovaDespesaRecorrencia] = useState<Recorrencia>('mensal');
  const [darkMode, setDarkMode] = useDarkMode();
  const [importErro, setImportErro] = useState<string | null>(null);
  const [importPendente, setImportPendente] = useState<AccountBackup | null>(null);
  const [backupProcessando, setBackupProcessando] = useState(false);
  const [configErro, setConfigErro] = useState<string | null>(null);
  const [relatorioEnviando, setRelatorioEnviando] = useState(false);
  const [relatorioMensagem, setRelatorioMensagem] = useState<string | null>(null);
  const [resetando, setResetando] = useState(false);
  const [resetErro, setResetErro] = useState<string | null>(null);
  const [acaoPendente, setAcaoPendente] = useState<'logout' | 'reset' | null>(null);
  const [despesaFixaSalvando, setDespesaFixaSalvando] = useState(false);
  const [despesaFixaErro, setDespesaFixaErro] = useState<string | null>(null);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [senhaSalvando, setSenhaSalvando] = useState(false);
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [senhaSucesso, setSenhaSucesso] = useState<string | null>(null);
  const [paginaDespesasFixas, setPaginaDespesasFixas] = useState(1);
  const arquivoInputRef = useRef<HTMLInputElement>(null);

  const despesasFixasPaginadas = paginateItems(config?.despesasFixas ?? [], paginaDespesasFixas);

  if (!config) return null;

  const salvarCampo = (patch: Partial<typeof config>) => {
    setConfigErro(null);
    void setConfig({ ...config, ...patch }).catch((error) => {
      setConfigErro(error instanceof Error ? error.message : 'Não foi possível salvar a configuração.');
    });
  };

  const adicionarDespesaFixa = async (e: FormEvent) => {
    e.preventDefault();
    const valor = parseMoney(novaDespesaValor);
    if (!novaDespesaNome.trim() || !valor || valor <= 0) return;

    setDespesaFixaSalvando(true);
    setDespesaFixaErro(null);
    try {
      await cadastrarDespesaFixaNoBanco({
        nome: novaDespesaNome.trim(),
        valor,
        recorrencia: novaDespesaRecorrencia,
      });
      setNovaDespesaNome('');
      setNovaDespesaValor('');
    } catch (error) {
      setDespesaFixaErro(error instanceof Error ? error.message : 'Não foi possível salvar a conta fixa.');
    } finally {
      setDespesaFixaSalvando(false);
    }
  };

  const removerDespesaFixa = async (id: string) => {
    setDespesaFixaErro(null);
    try {
      await removerDespesaFixaNoBanco(id);
    } catch (error) {
      setDespesaFixaErro(error instanceof Error ? error.message : 'Não foi possível remover a conta fixa.');
    }
  };

  const enviarRelatorioAgora = async () => {
    setRelatorioEnviando(true);
    setRelatorioMensagem(null);
    try {
      const response = await sendReportEmailRequest();
      setRelatorioMensagem(response.message);
    } catch (error) {
      setRelatorioMensagem(error instanceof Error ? error.message : 'Não foi possível enviar o relatório.');
    } finally {
      setRelatorioEnviando(false);
    }
  };

  const exportarDados = async () => {
    setBackupProcessando(true);
    setImportErro(null);
    try {
      const token = await ensureStoredAccessToken();
      const dados = await exportAccountBackupRequest(token);
      const conteudo = JSON.stringify(dados, null, 2);
      const blob = new Blob([conteudo], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup-caixafacil-${todayISO()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      setImportErro(error instanceof Error ? error.message : 'Não foi possível exportar o backup.');
    } finally {
      setBackupProcessando(false);
    }
  };

  const abrirSeletorDeArquivo = () => {
    setImportErro(null);
    arquivoInputRef.current?.click();
  };

  const handleArquivoSelecionado = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois, se precisar

    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const parsed = JSON.parse(String(leitor.result));
        if (
          !parsed || parsed.format !== 'caixafacil-postgres-backup' ||
          parsed.version !== 2 || typeof parsed.tables !== 'object'
        ) {
          setImportErro('Arquivo inválido ou versão de backup não suportada.');
          return;
        }
        setImportErro(null);
        setImportPendente(parsed as AccountBackup);
      } catch {
        setImportErro('Arquivo inválido: não foi possível interpretar o conteúdo como JSON.');
      }
    };
    leitor.onerror = () => setImportErro('Não foi possível ler o arquivo selecionado.');
    leitor.readAsText(arquivo);
  };

  const confirmarImportacao = async () => {
    if (!importPendente) return;
    setBackupProcessando(true);
    setImportErro(null);
    try {
      const token = await ensureStoredAccessToken();
      await restoreAccountBackupRequest(token, importPendente);
      window.location.reload();
    } catch (error) {
      setImportErro(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
      setImportPendente(null);
      setBackupProcessando(false);
    }
  };

  const zerarDadosDaConta = async () => {
    setResetando(true);
    setResetErro(null);
    try {
      await resetAccountData();
      resetData();
      setAcaoPendente(null);
      await logout();
    } catch (error) {
      setResetErro(error instanceof Error ? error.message : 'Não foi possível zerar os dados da conta.');
      setResetando(false);
    }
  };

  const confirmarAcaoPendente = async () => {
    if (acaoPendente === 'logout') {
      setAcaoPendente(null);
      try {
        await logout();
      } catch (error) {
        setResetErro(error instanceof Error ? error.message : 'Não foi possível sair da conta.');
      }
      return;
    }
    if (acaoPendente === 'reset') void zerarDadosDaConta();
  };

  const alterarSenha = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSenhaErro(null);
    setSenhaSucesso(null);
    const senhaInvalida = passwordPolicyError(novaSenha);
    if (senhaInvalida) {
      setSenhaErro(senhaInvalida);
      return;
    }
    if (novaSenha !== confirmarNovaSenha) {
      setSenhaErro('A confirmação da nova senha não confere.');
      return;
    }

    setSenhaSalvando(true);
    try {
      const message = await changePassword(senhaAtual, novaSenha, confirmarNovaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarNovaSenha('');
      setSenhaSucesso(message);
    } catch (error) {
      setSenhaErro(error instanceof Error ? error.message : 'Não foi possível alterar a senha.');
    } finally {
      setSenhaSalvando(false);
    }
  };

  const inputClasses =
    'w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30';

  return (
    <div className="fade-in space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      <header className="lg:col-span-2">
        <h2 className="font-display text-2xl font-bold text-ink">Configurações</h2>
        <p className="mt-1 text-sm text-ink-soft">Organize sua conta, seu negócio e as preferências do CaixaFácil.</p>
      </header>

      <section className="min-w-0 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5 lg:col-span-2">
        <div className="mb-4 flex items-start gap-3 border-b border-line pb-4">
          <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger">
            <ShieldCheck size={21} weight="duotone" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Conta e segurança</h3>
            <p className="mt-1 text-xs text-ink-soft">Consulte seu acesso e altere sua senha com segurança.</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-7">
          <div className="min-w-0">
            <label htmlFor="email-conta" className="mb-1 block text-xs font-medium text-ink-soft">E-mail da conta</label>
            <div className="relative">
              <EnvelopeSimple size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                id="email-conta"
                type="email"
                value={user?.email ?? ''}
                readOnly
                className="w-full rounded-lg border border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink outline-none"
              />
            </div>
            <p className="mt-2 text-xs text-ink-soft">Este é o e-mail usado para entrar no CaixaFácil.</p>
            <button
              type="button"
              onClick={() => setAcaoPendente('logout')}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-stamp/30 bg-stamp/5 px-4 py-2.5 text-sm font-bold text-stamp transition hover:bg-stamp/10 sm:w-auto"
            >
              <SignOut size={18} /> Sair da conta
            </button>
          </div>

          <form onSubmit={alterarSenha} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Senha atual</span>
              <div className="relative">
                <Key size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={senhaAtual}
                  onChange={(event) => setSenhaAtual(event.target.value)}
                  placeholder="Digite sua senha atual"
                  required
                  className="w-full rounded-lg border border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-ink-soft">Nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={novaSenha}
                onChange={(event) => setNovaSenha(event.target.value)}
                placeholder={PASSWORD_HINT}
                required
                className={inputClasses}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-ink-soft">Confirmar nova senha</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                value={confirmarNovaSenha}
                onChange={(event) => setConfirmarNovaSenha(event.target.value)}
                placeholder="Digite novamente"
                required
                className={inputClasses}
              />
            </label>
            {senhaErro && <p className="text-xs font-medium text-stamp sm:col-span-2">{senhaErro}</p>}
            {senhaSucesso && <p className="text-xs font-semibold text-ledger-strong dark:text-ledger sm:col-span-2">{senhaSucesso}</p>}
            <button
              type="submit"
              disabled={senhaSalvando}
              className="flex items-center justify-center gap-2 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:opacity-50 sm:col-span-2 sm:justify-self-end"
            >
              <Key size={17} /> {senhaSalvando ? 'Alterando…' : 'Alterar senha'}
            </button>
          </form>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Negócio</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nome do Negócio</label>
            <input
              type="text"
              defaultValue={config.nome}
              onBlur={(e) => salvarCampo({ nome: e.target.value.trim() || config.nome })}
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Ramo de Atuação</label>
            <select
              value={config.categoria}
              onChange={(e) => salvarCampo({ categoria: e.target.value })}
              className={inputClasses}
            >
              {RAMOS_ATUACAO.map((ramo) => (
                <option key={ramo} value={ramo}>
                  {ramo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">O que você oferece?</label>
            <select
              value={config.oferta}
              onChange={(e) => {
                const oferta = e.target.value as Oferta;
                salvarCampo({ oferta, controlaEstoque: oferta !== 'servicos' });
              }}
              className={inputClasses}
            >
              <option value="produtos">Produtos</option>
              <option value="servicos">Serviços</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Meta Diária de Vendas</label>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={config.metaDiariaVendas ?? ''}
              onInput={(e) => {
                e.currentTarget.value = sanitizeMoneyInput(e.currentTarget.value);
              }}
              onBlur={(e) =>
                salvarCampo({ metaDiariaVendas: e.target.value ? parseMoney(e.target.value) : undefined })
              }
              placeholder="Ex: 600,00"
              className={inputClasses}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Painel Inicial mostra números de</label>
            <select
              value={config.viewPeriod ?? 'day'}
              onChange={(e) => salvarCampo({ viewPeriod: e.target.value as ViewPeriod })}
              className={inputClasses}
            >
              <option value="day">Dia Atual</option>
              <option value="week">Semana (últimos 7 dias)</option>
            </select>
          </div>
        </div>
      </section>

      <div className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Aparência</h3>
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
              {darkMode ? <Moon size={16} /> : <Sun size={16} />} Modo escuro
            </span>
            <input
              type="checkbox"
              checked={darkMode}
              onChange={(e) => setDarkMode(e.target.checked)}
              className="h-5 w-5 accent-ledger"
            />
          </label>
        </section>

        <section className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger">
              <Headset size={20} weight="duotone" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Ajuda e suporte</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Está com problema no acesso, caixa ou configurações? Envie uma mensagem para a equipe.
              </p>
            </div>
          </div>
          <Link
            to="/suporte"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-ledger/25 bg-ledger/10 px-4 py-2.5 text-sm font-bold text-ledger-strong transition hover:border-ledger/40 hover:bg-ledger/20 dark:text-ledger"
          >
            Falar com o suporte <ArrowRight size={17} weight="bold" />
          </Link>
        </section>

        <section className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Despesas Fixas</h3>
          <ul className="mb-3 space-y-2">
            {config.despesasFixas.length === 0 && (
              <p className="text-sm text-ink-soft">Nenhuma despesa fixa cadastrada.</p>
            )}
            {despesasFixasPaginadas.items.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-paper p-2 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {d.nome} <span className="text-ink-soft">({d.recorrencia})</span>
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-ledger font-medium tabular-nums text-ink">{formatCurrency(d.valor)}</span>
                  <button onClick={() => void removerDespesaFixa(d.id)} className="text-ink-soft hover:text-stamp">
                    <Trash size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            currentPage={despesasFixasPaginadas.currentPage}
            totalItems={config.despesasFixas.length}
            onPageChange={setPaginaDespesasFixas}
            itemLabel="despesas fixas"
          />
          <form onSubmit={adicionarDespesaFixa} className="mt-4 space-y-2">
            <input
              type="text"
              value={novaDespesaNome}
              onChange={(e) => setNovaDespesaNome(e.target.value)}
              placeholder="Nome (ex: Aluguel)"
              className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={novaDespesaValor}
                onChange={(e) => setNovaDespesaValor(sanitizeMoneyInput(e.target.value))}
                placeholder="Ex: 900,00"
                className="w-28 min-w-0 rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
              <select
                value={novaDespesaRecorrencia}
                onChange={(e) => setNovaDespesaRecorrencia(e.target.value as Recorrencia)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              >
                <option value="mensal">Mensal</option>
                <option value="semanal">Semanal</option>
              </select>
              <button
                type="submit"
                disabled={despesaFixaSalvando}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-ledger/10 px-3 text-sm font-medium text-ledger-strong dark:text-ledger"
              >
                <Plus size={16} /> {despesaFixaSalvando ? 'Salvando…' : 'Add'}
              </button>
            </div>
            {despesaFixaErro && <p className="text-xs font-medium text-stamp">{despesaFixaErro}</p>}
          </form>
        </section>

        <section className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Relatórios</h3>
          {configErro && <p role="alert" className="mb-3 text-xs font-medium text-stamp">{configErro}</p>}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Frequência</label>
              <select
                value={config.relatorio.frequencia}
                onChange={(e) =>
                  salvarCampo({
                    relatorio: { ...config.relatorio, frequencia: e.target.value as FrequenciaRelatorio },
                  })
                }
                className={inputClasses}
              >
                <option value="nenhum">Nenhum</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="ambos">Semanal e Mensal</option>
              </select>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-ink-soft">Receber por e-mail</span>
              <input
                type="checkbox"
                checked={config.relatorio.porEmail}
                onChange={(e) => salvarCampo({ relatorio: { ...config.relatorio, porEmail: e.target.checked } })}
                className="h-5 w-5 accent-ledger"
              />
            </label>
            {config.relatorio.porEmail && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">E-mail</label>
                <input
                  type="email"
                  defaultValue={config.relatorio.email}
                  onBlur={(e) => salvarCampo({ relatorio: { ...config.relatorio, email: e.target.value } })}
                  placeholder="seuemail@exemplo.com"
                  className={inputClasses}
                />
              </div>
            )}
            <button
              onClick={() => void enviarRelatorioAgora()}
              disabled={relatorioEnviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong"
            >
              <PaperPlaneTilt size={18} /> {relatorioEnviando ? 'Enviando…' : 'Enviar Relatório Agora'}
            </button>
            {relatorioMensagem && <p role="status" className="text-xs font-medium text-ink-soft">{relatorioMensagem}</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-soft">Backup</h3>
          <p className="mb-3 text-xs text-ink-soft">
            Seus dados operacionais ficam no PostgreSQL/Neon. Este arquivo exporta catálogo, clientes, caixas, vendas,
            fiado, movimentações e configurações da sua conta.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => void exportarDados()}
              disabled={backupProcessando}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ledger/10 py-2.5 text-sm font-bold text-ledger-strong transition hover:bg-ledger/20 dark:text-ledger"
            >
              <DownloadSimple size={18} /> {backupProcessando ? 'Processando…' : 'Exportar Dados'}
            </button>
            <button
              onClick={abrirSeletorDeArquivo}
              disabled={backupProcessando}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line py-2.5 text-sm font-bold text-ink transition hover:bg-line/30"
            >
              <UploadSimple size={18} /> Importar Dados
            </button>
            <input
              ref={arquivoInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleArquivoSelecionado}
              className="hidden"
            />
          </div>
          {importErro && <p className="mt-2 text-xs font-medium text-stamp">{importErro}</p>}
        </section>

        <div className="rounded-2xl border border-stamp/20 p-4">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-stamp">Zona de risco</h3>
          <p className="mb-3 text-xs text-ink-soft">
            Apaga produtos, vendas, fiado, despesas, caixas e configurações. Seu e-mail e senha são mantidos. Ao
            concluir, você será desconectado e o próximo acesso começará pela configuração inicial.
          </p>
          <button
            onClick={() => setAcaoPendente('reset')}
            disabled={resetando}
            className="w-full rounded-lg border border-stamp/30 bg-stamp/10 py-2.5 text-sm font-bold text-stamp transition hover:bg-stamp/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetando ? 'Zerando dados...' : 'Zerar Dados do App'}
          </button>
          {resetErro && <p className="mt-2 text-xs font-medium text-stamp">{resetErro}</p>}
        </div>
      </div>

      <Modal open={importPendente !== null} onClose={() => setImportPendente(null)} title="Confirmar importação">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Isso vai <span className="font-semibold text-ink">substituir todos os dados atuais</span> pelo backup
            selecionado. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setImportPendente(null)}
              className="flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-line/30"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarImportacao()}
              disabled={backupProcessando}
              className="flex-1 rounded-lg bg-stamp px-4 py-2 text-sm font-semibold text-paper transition hover:bg-stamp/90"
            >
              Substituir Dados
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={acaoPendente !== null}
        onClose={() => {
          if (!resetando) setAcaoPendente(null);
        }}
        title={acaoPendente === 'reset' ? 'Zerar dados do app?' : 'Sair da conta?'}
      >
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stamp/10 text-stamp">
            {acaoPendente === 'reset' ? <Warning size={24} weight="fill" /> : <SignOut size={24} />}
          </div>
          <p className="text-sm text-ink-soft">
            {acaoPendente === 'reset'
              ? 'Produtos, entradas, fiado, despesas, caixas e configurações serão apagados. Seu e-mail e senha serão mantidos, e você será desconectado.'
              : 'Sua sessão será encerrada. Você precisará informar e-mail e senha para entrar novamente.'}
          </p>
          {acaoPendente === 'reset' && (
            <p className="rounded-lg bg-stamp/10 p-3 text-xs font-semibold text-stamp">Esta ação não pode ser desfeita.</p>
          )}
          {resetErro && <p className="text-xs font-medium text-stamp">{resetErro}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setAcaoPendente(null)}
              disabled={resetando}
              className="flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-line/30 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmarAcaoPendente()}
              disabled={resetando}
              className="flex-1 rounded-lg bg-stamp px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-stamp/90 disabled:opacity-60"
            >
              {resetando ? 'Zerando...' : acaoPendente === 'reset' ? 'Sim, zerar dados' : 'Sim, sair'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
