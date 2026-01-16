const { serviceMap } = require('./utils');

const commandsList = [
  '  up [--force] [service] → docker compose up -d [--force-recreate] <service>',
  '  down               → docker compose down (stop stack)',
  '  status             → docker compose ps',
  '  start <service>    → docker compose start <service>',
  '  logs <service>     → docker compose logs -f <service>',
  '  stop <service>     → docker compose stop <service>',
  '  restart <service>  → docker compose restart <service>',
  '  reload caddy       → docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile',
  '  reload tunnel      → docker compose restart cloudflared',
  '  sync               → docker compose run --rm recyclarr sync',
  '  test               → node --test test/test-services.test.mjs',
  '  env                → print key env values',
  '  ports              → show LAN/CF port map',
  '  mounts             → verify host paths',
  '  health             → docker compose ps --format json',
  '  doctor             → health + mounts + recent log scan'
];

const serviceCodes = () => {
  const lines = ['', 'Services (short codes):'];
  Object.entries(serviceMap).forEach(([code, name]) => {
    lines.push(`  ${code}  → ${name}`);
  });
  return lines;
};

function printHelp() {
  console.log(['Usage: ms <command>', 'Commands:', ...commandsList].join('\n'));
  console.log(serviceCodes().join('\n'));
}

module.exports = { printHelp };
