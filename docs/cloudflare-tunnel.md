# Cloudflare Tunnel — domínio → sua máquina

Use **Cloudflare Tunnel** (`cloudflared`), não só DNS A record. Seu PC fica atrás de NAT/firewall; o túnel sai **de dentro** da sua rede até a Cloudflare. O domínio aponta para a Cloudflare, e a Cloudflare entrega o tráfego ao seu `localhost`.

```
Usuário → https://app.seudominio.com
       → Cloudflare (SSL, proxy)
       → Túnel cloudflared (no seu PC)
       → http://127.0.0.1:3000  (Next.js)
       → http://127.0.0.1:3001  (API, subdomínio api.)
```

## Pré-requisitos

1. Domínio na **Cloudflare** (nameservers do registrador apontando para a Cloudflare).
2. Projeto rodando na máquina:
   - `docker compose up -d` (Postgres + backend)
   - `cd frontend && npm run dev` (ou `npm run build && npm start` para algo mais estável)
3. Conta Cloudflare (plano Free serve).

## 1. Instalar cloudflared (Windows)

```powershell
winget install Cloudflare.cloudflared
```

Ou baixe em: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## 2. Autenticar na Cloudflare

```powershell
cloudflared tunnel login
```

Abre o navegador; escolha a **zona** (domínio) que vai usar.

## 3. Criar o túnel

```powershell
cloudflared tunnel create escalas-plus
```

Anote o **Tunnel ID** e o caminho do arquivo JSON de credenciais (ex.: `%USERPROFILE%\.cloudflared\<id>.json`).

## 4. Arquivo de configuração

Crie `%USERPROFILE%\.cloudflared\config.yml` (ajuste domínios e portas):

```yaml
tunnel: escalas-plus
credentials-file: C:\Users\SEU_USUARIO\.cloudflared\TUNNEL_ID_AQUI.json

ingress:
  # Frontend (Next.js)
  - hostname: app.seudominio.com
    service: http://127.0.0.1:3000
  # API (Express)
  - hostname: api.seudominio.com
    service: http://127.0.0.1:3001
  # obrigatório: regra final
  - service: http_status:404
```

Substitua `app.seudominio.com` e `api.seudominio.com` pelos subdomínios reais.

## 5. DNS na Cloudflare (automático)

```powershell
cloudflared tunnel route dns escalas-plus app.seudominio.com
cloudflared tunnel route dns escalas-plus api.seudominio.com
```

Isso cria registros **CNAME** apontando para o túnel (`*.cfargotunnel.com`). Não precisa abrir porta 80/443 no roteador.

Conferir no painel: **DNS → Records** — deve aparecer CNAME `app` e `api` com proxy laranja (proxied).

## 6. Subir o túnel

```powershell
cloudflared tunnel run escalas-plus
```

Deixe esse terminal aberto (ou instale como serviço Windows, seção 8).

Teste: `https://app.seudominio.com` e `https://api.seudominio.com/api` (ou rota de health se existir).

## 7. Variáveis do Escalas Plus

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://api.seudominio.com/api
NEXT_PUBLIC_APP_URL=https://app.seudominio.com
NEXT_PUBLIC_APP_MODE=prod
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

Reinicie o Next após alterar: `npm run dev` ou `npm run build && npm start`.

### Backend (`backend/.env` ou `docker-compose` environment)

```env
FRONTEND_URL=https://app.seudominio.com
APP_MODE=prod
DB_NAME=escalas_prod
JWT_SECRET=uma_chave_longa_e_aleatoria
```

No `docker-compose.yml`, sobrescreva `FRONTEND_URL` para o domínio público.

Links de WhatsApp e e-mail mágico usam `FRONTEND_URL` — precisam ser HTTPS do domínio real.

### Google OAuth (se usar)

No Google Cloud Console, em **Origens JavaScript autorizadas** e **URIs de redirecionamento**, inclua `https://app.seudominio.com`.

## 8. Rodar o túnel como serviço (opcional)

```powershell
cloudflared service install
cloudflared tunnel run escalas-plus
```

Ou configure o serviço apontando para o `config.yml` (documentação Cloudflare: *Run as a service on Windows*).

## 9. Checklist de problemas

| Sintoma | O que verificar |
|--------|------------------|
| 502 / erro Cloudflare | Backend/frontend rodando? `curl http://127.0.0.1:3001` na máquina |
| CORS / API não responde | `NEXT_PUBLIC_API_URL` com `https://api...` e `/api` no final |
| Login OK local, falha no domínio | `FRONTEND_URL` e cookies; usar HTTPS em ambos subdomínios |
| WhatsApp link errado | `FRONTEND_URL` no backend |
| Túnel cai | PC desligado ou processo `cloudflared` parado |

**Não exponha** a porta `5432` (Postgres) no túnel — só 3000 e 3001.

## 10. Um único hostname (alternativa)

Se quiser só `escalas.seudominio.com` sem subdomínio `api`, use **Cloudflare Workers** ou um reverse proxy local (Caddy/nginx) na porta 8080 que roteie `/api` → 3001 e `/` → 3000. O túnel apontaria só para `8080`. O projeto hoje espera API em URL separada (`NEXT_PUBLIC_API_URL`).

## Referências

- [Cloudflare Tunnel — documentação](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Configuração ingress](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/configuration-file/)
