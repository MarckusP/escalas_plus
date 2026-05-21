import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import api from '../utils/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ChurchSearchSelect from '../components/ChurchSearchSelect';
import PasswordPolicyHint from '../components/PasswordPolicyHint';
import { validatePassword } from '../utils/passwordPolicy';

type DeptOption = { id: number; name: string; icon?: string };
type RoleOption = { id: number; name: string; department_id: number; department_name: string };

export default function CadastroVoluntario() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    church_id: '',
    phone_ddd: '',
    phone_number: '',
  });
  const [churches, setChurches] = useState<{ id: number; name: string }[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [verifyToken, setVerifyToken] = useState('');
  const [otpChannel, setOtpChannel] = useState<'email' | 'whatsapp'>('whatsapp');
  const [otpCode, setOtpCode] = useState('');
  const [loginChannel, setLoginChannel] = useState<'email' | 'whatsapp'>('whatsapp');

  useEffect(() => {
    async function load() {
      try {
        const { data: cData } = await api.get('/churches');
        setChurches(Array.isArray(cData) ? cData : []);
      } catch {
        toast.error('Erro ao carregar igrejas');
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadOptions() {
      if (!form.church_id) {
        setDepartments([]);
        setRoles([]);
        setSelectedDepts([]);
        setSelectedRoles([]);
        return;
      }
      setLoadingOptions(true);
      try {
        const { data } = await api.get(`/public/signup-options?church_id=${form.church_id}`);
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
        setRoles(Array.isArray(data.roles) ? data.roles : []);
        setSelectedDepts([]);
        setSelectedRoles([]);
      } catch {
        toast.error('Erro ao carregar ministérios e funções');
        setDepartments([]);
        setRoles([]);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, [form.church_id]);

  const rolesForSelectedDepts = useMemo(() => {
    if (selectedDepts.length === 0) return [];
    const set = new Set(selectedDepts);
    return roles.filter(r => set.has(r.department_id));
  }, [roles, selectedDepts]);

  useEffect(() => {
    const allowed = new Set(rolesForSelectedDepts.map(r => r.id));
    setSelectedRoles(prev => prev.filter(id => allowed.has(id)));
  }, [rolesForSelectedDepts]);

  const sendVerification = async () => {
    if (!form.email || !form.phone_ddd || !form.phone_number) {
      toast.error('Preencha e-mail e telefone');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/register/send-code', {
        channel: otpChannel,
        email: form.email.trim(),
        phone_ddd: form.phone_ddd,
        phone_number: form.phone_number,
      });
      setStep('verify');
      toast.success(
        otpChannel === 'whatsapp' ? 'Código enviado no WhatsApp' : 'Código enviado (dev: veja o console do backend)'
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar código');
    } finally {
      setLoading(false);
    }
  };

  const confirmVerification = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register/verify-code', {
        channel: otpChannel,
        email: form.email.trim(),
        phone_ddd: form.phone_ddd,
        phone_number: form.phone_number,
        code: otpCode,
      });
      setVerifyToken(data.verifyToken);
      setStep('form');
      toast.success('Telefone/e-mail verificado!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyToken) {
      toast.error('Valide seu WhatsApp ou e-mail antes de concluir');
      return;
    }
    if (!form.church_id) {
      toast.error('Selecione uma igreja');
      return;
    }
    if (selectedDepts.length === 0) {
      toast.error('Selecione ao menos um ministério');
      return;
    }
    if (selectedRoles.length === 0) {
      toast.error('Selecione ao menos uma função');
      return;
    }
    const pwdCheck = validatePassword(form.password);
    if (!pwdCheck.ok) {
      toast.error(pwdCheck.errors[0]);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        church_id: Number(form.church_id),
        phone_ddd: form.phone_ddd.replace(/\D/g, ''),
        phone_number: form.phone_number.replace(/\D/g, ''),
        department_ids: selectedDepts,
        role_ids: selectedRoles,
        verify_token: verifyToken,
        login_otp_channel: loginChannel,
      };
      await api.post('/auth/register-public', payload);
      setSubmitted(true);
      toast.success('Solicitação enviada! O líder do ministério ou o administrador irá aprovar.');
      setForm({ name: '', email: '', password: '', church_id: '', phone_ddd: '', phone_number: '' });
      setSelectedDepts([]);
      setSelectedRoles([]);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao realizar cadastro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Cadastro de Voluntário - Escalas Plus</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-white">Quero ser Voluntário</h2>
            <p className="mt-2 text-gray-400 text-sm">
              Escolha igreja, ministério e função. Sua conta ficará pendente até o líder do ministério
              ou o administrador aprovar.
            </p>
          </div>

          {submitted ? (
            <div className="text-center space-y-4 py-4">
              <p className="text-emerald-400 font-medium">Cadastro recebido com sucesso.</p>
              <p className="text-sm text-gray-400">
                Aguarde a aprovação. Depois use o e-mail e a senha criados aqui para entrar.
              </p>
              <Link href="/login" className="inline-block text-blue-400 hover:text-blue-300 text-sm">
                Ir para o login
              </Link>
            </div>
          ) : step === 'verify' ? (
            <div className="mt-8 space-y-4">
              <p className="text-sm text-gray-400 text-center">
                Código enviado por {otpChannel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}
              </p>
              <input
                className="w-full px-3 py-2 text-center text-lg tracking-widest border border-gray-600 bg-gray-700 text-white rounded"
                placeholder="000000"
                maxLength={6}
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                onClick={confirmVerification}
                disabled={loading}
                className="w-full py-2 rounded-lg bg-blue-600 text-white font-medium"
              >
                Confirmar código
              </button>
              <button type="button" className="w-full text-sm text-gray-400" onClick={() => setStep('form')}>
                Voltar ao formulário
              </button>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <input
                  required
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
                <input
                  required
                  type="email"
                  placeholder="E-mail"
                  className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
                <input
                  required
                  type="password"
                  placeholder="Crie uma Senha"
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <PasswordPolicyHint />

                <div className="border border-gray-600 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-400 font-semibold uppercase">
                    Validação do número (2FA no login)
                  </p>
                  <div className="flex gap-4 text-sm text-gray-300">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={otpChannel === 'whatsapp'}
                        onChange={() => setOtpChannel('whatsapp')}
                      />
                      Validar por WhatsApp
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={otpChannel === 'email'}
                        onChange={() => setOtpChannel('email')}
                      />
                      Validar por e-mail
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={sendVerification}
                    disabled={loading}
                    className="w-full py-2 text-sm rounded-lg bg-green-600/80 text-white"
                  >
                    Enviar código de verificação
                  </button>
                  {verifyToken && (
                    <p className="text-xs text-emerald-400">✓ Verificado</p>
                  )}
                  <p className="text-xs text-gray-500">No login, o código irá para:</p>
                  <select
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                    value={loginChannel}
                    onChange={e => setLoginChannel(e.target.value as 'email' | 'whatsapp')}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    required
                    placeholder="DDD"
                    maxLength={3}
                    className="w-20 px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500"
                    value={form.phone_ddd}
                    onChange={e => setForm({ ...form, phone_ddd: e.target.value })}
                  />
                  <input
                    required
                    placeholder="Celular"
                    className="flex-1 px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500"
                    value={form.phone_number}
                    onChange={e => setForm({ ...form, phone_number: e.target.value })}
                  />
                </div>

                <ChurchSearchSelect
                  churches={churches}
                  value={form.church_id}
                  onChange={church_id => setForm({ ...form, church_id })}
                  required
                />

                {form.church_id && (
                  <>
                    {loadingOptions ? (
                      <p className="text-xs text-gray-500">Carregando ministérios e funções...</p>
                    ) : (
                      <>
                        {departments.length > 0 ? (
                          <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                              Ministério(s) *
                            </label>
                            <div className="space-y-1 max-h-36 overflow-y-auto bg-gray-900 p-2 rounded border border-gray-700">
                              {departments.map(dept => {
                                const checked = selectedDepts.includes(dept.id);
                                return (
                                  <label key={dept.id} className="flex items-center gap-2 cursor-pointer py-1">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setSelectedDepts(
                                          checked
                                            ? selectedDepts.filter(d => d !== dept.id)
                                            : [...selectedDepts, dept.id]
                                        );
                                      }}
                                      className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600"
                                    />
                                    <span className="text-xs text-gray-300">
                                      {dept.icon ? `${dept.icon} ` : ''}
                                      {dept.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-500">
                            Nenhum ministério cadastrado nesta igreja. Contacte o administrador.
                          </p>
                        )}

                        {selectedDepts.length > 0 && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                              Função(ões) *
                            </label>
                            <div className="space-y-1 max-h-40 overflow-y-auto bg-gray-900 p-2 rounded border border-gray-700">
                              {rolesForSelectedDepts.map(role => {
                                const checked = selectedRoles.includes(role.id);
                                return (
                                  <label key={role.id} className="flex items-center gap-2 cursor-pointer py-1">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        setSelectedRoles(
                                          checked
                                            ? selectedRoles.filter(r => r !== role.id)
                                            : [...selectedRoles, role.id]
                                        );
                                      }}
                                      className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600"
                                    />
                                    <span className="text-xs text-gray-300">
                                      {role.name}{' '}
                                      <span className="text-gray-500">({role.department_name})</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              <button
                disabled={loading || loadingOptions}
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar Solicitação'}
              </button>
              <div className="text-center">
                <Link href="/login" className="text-gray-400 hover:text-white text-sm">
                  Voltar para Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
