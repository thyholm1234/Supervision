# Supervisionsregnskab

PWA til at registrere supervision, konfrontationstimer, arbejdstid og egenterapi frem mod anerkendelse som
**psykolog med praksisuddannelse (klinisk psykolog)**. Alle brugerdata er **end-to-end-krypteret**: serveren og
dens ejer kan ikke læse dem.

## Regelgrundlag

Beregningerne følger **BEK nr. 247 af 5. februar 2026 om psykologers praksisuddannelse, bilag 2 (overgangsordning)**,
der viderefører Psykolognævnets krav til og med **31. december 2028**. Reglerne ligger samlet i `static/js/rules.js`
(`RULES`-objektet), og hver beregning henviser til sit punkt:

| Krav | Regel |
|---|---|
| ≥ 2 års fuldtid (≥ 30 t/uge = fuldtid; < 15 t/uge tæller ikke; fravær > 8 sammenhængende uger fratrækkes) | pkt. 1.1–1.5 |
| Selvstændig: 600 konfrontationstimer/år = fuldtid | pkt. 1.4 |
| ≥ 500 t udredning og ≥ 500 t intervention | pkt. 2.1 |
| ≥ 200 t med individer og ≥ 200 t med grupper/organisationer | pkt. 2.2 |
| Indirekte arbejde højst halvdelen | pkt. 2.3 |
| ≥ 160 t supervision fra ≥ 2 supervisorer | pkt. 3.1 |
| ≥ 40 t individuel, ≥ 40 t gruppe (omregnet), ≥ 40 t hos samme eksterne supervisor | pkt. 3.2 |
| Supervisor: gennemført praksisuddannelse + ≥ 3 års erfaring | pkt. 3.3 |
| Gruppeomregning: 2 = fuldt, 3–5 = ⅔, 6–12 = ½, 13+ = 0 | pkt. 3.4 |
| Et forløb skal være ≥ 5 omregnede timer | pkt. 3.5 |
| Egenterapi op til 25 t (reducerer kun totalkravet) | pkt. 4 |
| Video: højst 80 t supervision og højst 250 t pr. aktivitet for konfrontation | pkt. 5.1 |

Når loftet for video eller indirekte timer overskrides, trækkes overskuddet forholdsmæssigt fra hver berørt
registrering. Det er en forsigtig fortolkning: Styrelsen for Patientsikkerhed træffer den endelige afgørelse.

## Funktioner

- Indtastning og oversigt over supervision og konfrontation (som det oprindelige værktøj), samt egenterapi.
- Arbejdsforhold med perioder, timer pr. uge og fravær. Supervisorer og supervisionsforløb (intern/ekstern, individuel/gruppe).
- Overblik med alle 10 krav, advarsler, prognose (tempo over de seneste 90 dage), månedsdiagrammer, timer pr. supervisor og konfrontationsmatrix.
- Rapporter til underskrift: samlet opgørelse (med erklæring på tro og love), pr. supervisionsforløb (supervisor),
  pr. arbejdsforhold (arbejdsgiver) og egenterapi (terapeut). Kan afgrænses til en periode og gemmes som PDF via udskrift.
- **Uddannelsesforløb:** uddannelsesaftaler (BEK 247/2026, § 4) genereret fra skabeloner for PPR, psykiatri,
  arbejds- og organisationspsykologi, HR og selvstændig praksis. Hver aftale har statussamtaler, læringsaktiviteter,
  regelkontrol (fx aftale indgået før perioden, overlap, 3 måneders fuldtid, 10 % fravær, krav til uddannelsesansvarlig)
  og to rapporter til underskrift: selve aftalen og en forløbsrapport med bilagsfortegnelse.
- **Dokumentation:** filer (underskrevne aftaler, statusreferater, erklæringer m.m.) kan gemmes på uddannelsesaftaler,
  arbejdsforhold og supervisionsforløb. De krypteres i browseren (AES-256-GCM, fyldt op til 64 KiB-blokke).
  Standard er maks. 15 MB pr. fil og 250 MB pr. bruger (`SUPERVISION_MAX_FILE_MB`, `SUPERVISION_QUOTA_MB`).
- Krypteret backup som ZIP (alle registreringer + uploadede dokumenter), beskyttet af en backup-adgangskode (PBKDF2-SHA256 600k + HKDF → AES-256-GCM). Kan gendannes på samme eller en anden konto; eksisterende poster springes over. Ældre JSON-backups kan stadig importeres. CSV-eksport af supervision og konfrontationstimer.
- Superadmin-panel med anonym, aggregeret brugsstatistik.
- Installerbar PWA. App-skallen virker offline; data kræver forbindelse.

## Sikkerhedsmodel

```
adgangskode ─PBKDF2-SHA256 (600.000)─▶ master ─HKDF─▶ authKey ──▶ server (gemmes som scrypt-hash)
                                               └HKDF─▶ KEK (forlader aldrig browseren)
DEK (tilfældig AES-256-GCM) ─ wrap med KEK ─▶ server
                            ─ wrap med gendannelseskode-KEK ─▶ server
hver post: AES-256-GCM(DEK, tilfældig IV, AAD = post-id) ─▶ server
```

- Serveren ser kun: brugernavn, krypterede poster (antal, størrelse, versionsnummer), krypterede filer (antal og størrelse
  afrundet op til 64 KiB), oprettelsesdag og sidst-set-dag.
  Den ser **ikke** posttyper, datoer, timetal, navne eller noget andet indhold.
- Adgangskodekrav (mindst 12 tegn, små og store bogstaver, tal og specialtegn) håndhæves i klienten.
  Serveren ser aldrig adgangskoden og kan derfor ikke selv kontrollere den.
- **Glemt adgangskode:** ved oprettelsen vises en gendannelseskode (ca. 125 bit) én gang. Uden den kan data ikke gendannes af nogen.
- Sessioner: tilfældig token i en `HttpOnly`, `Secure`, `SameSite=Strict`-cookie med præfikset `__Host-`. Kun en hash gemmes på serveren.
  Sessionen udløber efter 60 minutters inaktivitet og senest efter 12 timer.
- Appen låser automatisk efter 30 minutters inaktivitet. DEK'en gemmes ikke-eksporterbar i IndexedDB, så en genindlæsning
  ikke kræver adgangskoden igen, og den slettes ved lås og log ud.
- CSRF: `SameSite=Strict`, en påkrævet `X-Requested-With`-header og kontrol af `Origin`.
- Streng CSP (`script-src 'self'`, ingen inline-scripts eller -styles, ingen tredjepartsressourcer), HSTS, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer` og COOP/CORP.
- Hastighedsbegrænsning på login, oprettelse og gendannelse. Kontoen låses i 15 minutter efter 10 forkerte forsøg.
  Ukendte brugernavne får en deterministisk lokkesalt, så man ikke kan afgøre, om et brugernavn findes.
- Alt brugerindhold escapes ved rendering (`html`-tagget template). CSV-eksport neutraliserer formelinjektion.

**Grænse, man skal kende:** som ved al web-baseret E2E-kryptering stoler brugeren på den JavaScript, serveren leverer.
En kompromitteret eller ondsindet server kunne levere ændret kode. Serveren skal derfor driftes forsvarligt:
read-only kode, adgangskontrol og opdateringer. Service workeren henter altid nyeste kode, når der er netforbindelse.

## Kør lokalt

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
SUPERVISION_COOKIE_SECURE=0 .venv/bin/uvicorn server.main:app --reload --port 8000
# åbn http://localhost:8000
```

`SUPERVISION_COOKIE_SECURE=0` må kun bruges lokalt over http.

## Drift (produktion)

Kør uvicorn bag en reverse proxy med TLS, fx nginx (se eksemplet under Docker Compose).

```bash
.venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1
```

Kør **én** uvicorn-proces. Rate-limiteren ligger i hukommelsen, og den lave trafik kræver ikke flere.
Eksempel på en systemd-unit:

```ini
[Service]
User=supervision
WorkingDirectory=/opt/supervision
Environment=SUPERVISION_DATA_DIR=/var/lib/supervision
ExecStart=/opt/supervision/.venv/bin/uvicorn server.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips 127.0.0.1
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/supervision
PrivateTmp=true
```

Miljøvariabler: `SUPERVISION_DATA_DIR`, `SUPERVISION_DB`, `SUPERVISION_SECRET` (genereres ellers i datamappen),
`SUPERVISION_SESSION_HOURS` (standard 12), `SUPERVISION_IDLE_MINUTES` (standard 60) og `SUPERVISION_COOKIE_SECURE`.

Backup: kopiér `supervision.db`, fx med `sqlite3 supervision.db ".backup backup.db"`. Indholdet er krypteret.

### Superadmin

Opret først en almindelig bruger i appen og forfrem den derefter:

```bash
.venv/bin/python -m server.manage make-admin <brugernavn>
.venv/bin/python -m server.manage revoke-admin <brugernavn>
.venv/bin/python -m server.manage purge-sessions
```

Panelet viser kun aggregerede tal: antal brugere, aktive pr. dag/uge/måned, logins, oprettelser, skrivninger,
mislykkede logins, sletninger, fordelingen af brugere på antal poster og databasestørrelse.

## Docker Compose

`docker-compose.yml` starter appen i én container. Den kører som en bruger uden root-rettigheder, på et
skrivebeskyttet filsystem og uden capabilities. Data ligger i volumen `supervision-data`. Appen lytter på port
`9473` på alle interfaces. Port og adresse kan ændres med `SUPERVISION_PORT` og `SUPERVISION_BIND` i `.env`
(`127.0.0.1`, hvis kun nginx på samme maskine skal kunne nå den).

Kører nginx på en anden maskine, så sæt `SUPERVISION_TRUSTED_PROXIES=<nginx-IP>`. Ellers ser appen nginx' IP for alle
brugere, og rate-limiteren rammer alle på én gang. Docker åbner porten uden om `ufw`/`firewalld`, så begræns den i
firewallen eller hos hostingudbyderen, hvis den kun skal være åben for nginx.

```bash
cp .env.example .env        # valgfrit
docker compose up -d --build
```

nginx foran, med TLS. `Host` skal sendes videre, ellers afviser appen skrivninger (Origin-tjek):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name supervision.example.dk;
    ssl_certificate     /etc/letsencrypt/live/supervision.example.dk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supervision.example.dk/privkey.pem;

    client_max_body_size 20m;   # bilag op til 15 MB + padding

    location / {
        proxy_pass http://127.0.0.1:9473;   # eller app-værtens IP
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;
    }
}
server {
    listen 80;
    server_name supervision.example.dk;
    return 301 https://$host$request_uri;
}
```

Appen sætter selv sikkerhedsheadere (CSP, HSTS m.fl.), så nginx skal ikke tilføje dem. `X-Forwarded-For` sættes
til `$remote_addr`, ikke `$proxy_add_x_forwarded_for`, så klienter ikke kan forfalske deres IP over for
rate-limiteren.

```bash
docker compose exec app python -m server.manage make-admin <brugernavn>
# Backup af databasen (indholdet er krypteret):
docker compose exec app python -c "import sqlite3; sqlite3.connect('/data/supervision.db').backup(sqlite3.connect('/data/backup.db'))"
docker compose cp app:/data/backup.db ./supervision-backup.db
```

Opdatering: `git pull && docker compose up -d --build`.

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

`tests/test_rules.py` kører regelmotoren (`rules.js`) i V8 via mini-racer. `tests/test_api.py` tester auth,
isolation mellem brugere, konflikthåndtering, CSRF, lockout, gendannelse og adminadgang.
