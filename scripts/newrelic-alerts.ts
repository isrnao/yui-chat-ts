// New Relic のアラート条件をコードで管理する（spec observability-new-relic Task 5 / Requirement 7）。
// design.md「アラート設計」の条件表と、この定義を一致させる（R7.10）。
//
// 使い方（既定は差分を表示するだけ。--apply を付けたときだけ反映する）:
//   node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts
//   node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts --apply
//   node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts --env alert-test --apply
//   node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts --env alert-test --delete
//   node --experimental-strip-types --env-file=.env scripts/newrelic-alerts.ts --pagerduty   # 通知経路（C1 のみ）
//
// --env は deployment.environment.name の値。alert-test は故障注入が使えるローカル環境での
// 発報テスト用で、ポリシー名に環境名が付くので本番の条件とは別に作られる。
//
// 必要な環境変数: NEW_RELIC_USER_API_KEY（User キー）, VITE_NEW_RELIC_ACCOUNT_ID
// （--pagerduty の初回は PAGERDUTY_INTEGRATION_KEY も必要）
//
// 共通の設定（design.md「共通ルール」）:
// - まばらなデータなので Event timer（60 秒）。スライディングウィンドウは 1 分刻み。
// - データがない時間帯は 0 で補う（gap filling）。エラーだけを数えるのではなく、対象のスパン
//   全体を filter() で数えるので、アクセスがあってエラーがなければ値は 0 になる。
// - Loss of Signal では新しく発報せず、開いているインシデントを閉じる（15 分）。
// - しきい値を下回ったら自動でクローズする（Observed_Clear）。復旧の確認は runbook で行う。
// - C3（Browser）は、送るデータができてから追加する（R7.12）。C7（ログ）は Phase 4 で追加した。
// - NerdGraph（の手前の WAF）は、改行とインデントを含む mutation に NRQL・名前・説明がそろうと、
//   接続を切る（ECONNRESET。curl でも同じ）。要素を 1 つずつ変えると通るので、本文全体での判定と
//   考えられる。送る前にクエリの空白をまとめ、念のため 1.2 秒の間隔と再試行も入れる。
import process from 'node:process';

type Priority = 'CRITICAL' | 'WARNING';

interface ConditionDef {
  id: string;
  title: string;
  policy: 'paging' | 'monitor';
  description: string;
  nrql: (env: string) => string;
  windowSec: number;
  threshold: number;
  operator: 'ABOVE' | 'ABOVE_OR_EQUALS';
  occurrences: 'AT_LEAST_ONCE' | 'ALL';
  durationSec: number;
  priority: Priority;
}

const where = (env: string) => `deployment.environment.name = '${env}'`;

export const CONDITIONS: ConditionDef[] = [
  {
    id: 'C1',
    title: 'save-chat save failures (failed operations)',
    policy: 'paging',
    // DB insert に失敗した送信操作（chat.operation.id）の数。同じ操作の再試行は 1 と数える。
    // 主条件（PagerDuty・高緊急度）。クローズは Observed_Clear で、復旧は runbook で確認する。
    description:
      'Send operations (chat.operation.id) whose DB insert failed; retries of one send count once. ' +
      'Primary paging condition. Auto-close means no failures are observed, not recovery: verify per runbook.',
    nrql: (env) =>
      `SELECT filter(uniqueCount(chat.operation.id), WHERE otel.status_code = 'ERROR') ` +
      `FROM Span WHERE service.name = 'save-chat' AND name = 'db insert chats' AND ${where(env)}`,
    windowSec: 300,
    threshold: 2,
    operator: 'ABOVE_OR_EQUALS',
    occurrences: 'AT_LEAST_ONCE',
    durationSec: 300,
    priority: 'CRITICAL',
  },
  {
    id: 'C2',
    title: 'save-chat 5xx (other than DB save failures)',
    policy: 'monitor',
    // DB 保存失敗（C1）以外の 5xx。設定ミスや想定外の例外。New Relic 上での確認用。
    description:
      'save-chat 5xx other than DB save failures (C1): misconfiguration or unexpected errors.',
    nrql: (env) =>
      `SELECT filter(count(*), WHERE otel.status_code = 'ERROR' AND error.code != 'db_insert_failed') ` +
      `FROM Span WHERE service.name = 'save-chat' AND name = 'POST save-chat' AND ${where(env)}`,
    windowSec: 600,
    threshold: 3,
    operator: 'ABOVE_OR_EQUALS',
    occurrences: 'AT_LEAST_ONCE',
    durationSec: 600,
    priority: 'CRITICAL',
  },
  {
    id: 'C4',
    title: 'okiraku-api evaluation failures (502 / 504)',
    policy: 'paging',
    // 評価プロバイダの失敗（502）とタイムアウト（504）。PagerDuty・低緊急度（warning）。
    description:
      'Evaluation provider failures (502) and timeouts (504). Pages at low urgency (warning).',
    nrql: (env) =>
      `SELECT filter(count(*), WHERE http.response.status_code IN (502, 504)) ` +
      `FROM Span WHERE service.name = 'okiraku-api' AND name = 'POST /api/v1/evaluate' AND ${where(env)}`,
    windowSec: 900,
    threshold: 3,
    operator: 'ABOVE_OR_EQUALS',
    occurrences: 'AT_LEAST_ONCE',
    durationSec: 900,
    priority: 'WARNING',
  },
  {
    id: 'C5',
    title: 'save-chat slow (>5% over 2s, min 5 requests)',
    policy: 'monitor',
    // p95 > 2000ms と同じ意味。NRQL の if() では percentile を使えないため、割合 ×
    // floor(clamp_max(count, 5) / 5) で最低 5 件に満たない窓を 0 にする。
    description:
      'Equivalent to p95 > 2000ms. Windows with fewer than 5 requests evaluate to 0 ' +
      '(if() cannot wrap percentile in NRQL).',
    nrql: (env) =>
      `SELECT percentage(count(*), WHERE duration.ms > 2000) * floor(clamp_max(count(*), 5) / 5) ` +
      `FROM Span WHERE service.name = 'save-chat' AND name = 'POST save-chat' AND ${where(env)}`,
    windowSec: 900,
    threshold: 5,
    operator: 'ABOVE',
    occurrences: 'ALL',
    durationSec: 900,
    priority: 'CRITICAL',
  },
  {
    id: 'C6',
    title: 'evaluation slow (>5% over 6s, min 5 requests)',
    policy: 'monitor',
    // evaluation.run の p95 > 6000ms と同じ意味（評価のタイムアウトは 8 秒）。
    description: 'Equivalent to evaluation.run p95 > 6000ms (the evaluation timeout is 8s).',
    nrql: (env) =>
      `SELECT percentage(count(*), WHERE duration.ms > 6000) * floor(clamp_max(count(*), 5) / 5) ` +
      `FROM Span WHERE service.name = 'okiraku-api' AND name = 'evaluation.run' AND ${where(env)}`,
    windowSec: 900,
    threshold: 5,
    operator: 'ABOVE',
    occurrences: 'ALL',
    durationSec: 900,
    priority: 'CRITICAL',
  },
  {
    id: 'C7',
    title: 'triage failures (triage.failed logs)',
    policy: 'monitor',
    // 管理者チャットの振り分け（triage）が失敗・期限切れで終わった件数。save-chat の構造化ログ
    // （OTLP logs）の triage.failed を数える。ログが New Relic に届くことを確認してから追加した（R7.12）。
    description:
      'Admin-chat triage that ended in failure or hit its deadline (triage.failed logs).',
    nrql: (env) =>
      `SELECT filter(count(*), WHERE event = 'triage.failed') ` +
      `FROM Log WHERE service.name = 'save-chat' AND ${where(env)}`,
    windowSec: 3600,
    threshold: 1,
    operator: 'ABOVE_OR_EQUALS',
    occurrences: 'AT_LEAST_ONCE',
    durationSec: 3600,
    priority: 'CRITICAL',
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const env = arg('env') ?? 'production';
const account = Number(process.env.VITE_NEW_RELIC_ACCOUNT_ID);
const key = process.env.NEW_RELIC_USER_API_KEY;
const suffix = env === 'production' ? '' : ` [${env}]`;
const policyName = (p: ConditionDef['policy']) => `okiraku-chat (${p})${suffix}`;
const conditionName = (c: ConditionDef) => `${c.id} ${c.title}${suffix}`;

let lastCall = 0;

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!key || !account)
    throw new Error('NEW_RELIC_USER_API_KEY と VITE_NEW_RELIC_ACCOUNT_ID が必要です');
  for (let attempt = 1; ; attempt++) {
    const wait = lastCall + 1200 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const res = await fetch('https://api.newrelic.com/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'API-Key': key },
        body: JSON.stringify({ query: query.replace(/\s+/g, ' ').trim(), variables }),
      });
      const body = await res.json();
      if (body.errors?.length) throw new Error(JSON.stringify(body.errors));
      return body.data as T;
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code !== 'ECONNRESET' || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    }
  }
}

function conditionInput(c: ConditionDef) {
  return {
    name: conditionName(c),
    // description は送らない（NRQL と一緒に送ると WAF に切られることがあるため。説明はこのファイルに残す）
    enabled: true,
    nrql: { query: c.nrql(env) },
    signal: {
      aggregationWindow: c.windowSec,
      slideBy: 60,
      aggregationMethod: 'EVENT_TIMER',
      aggregationTimer: 60,
      fillOption: 'STATIC',
      fillValue: 0,
    },
    terms: [
      {
        threshold: c.threshold,
        thresholdOccurrences: c.occurrences,
        thresholdDuration: c.durationSec,
        operator: c.operator,
        priority: c.priority,
      },
    ],
    expiration: {
      expirationDuration: 900,
      closeViolationsOnExpiration: true,
      openViolationOnExpiration: false,
      ignoreOnExpectedTermination: false,
    },
    violationTimeLimitSeconds: 86400,
  };
}

async function findPolicy(name: string): Promise<string | undefined> {
  const data = await graphql<{
    actor: {
      account: { alerts: { policiesSearch: { policies: { id: string; name: string }[] } } };
    };
  }>(
    `
      query ($account: Int!, $name: String!) {
        actor {
          account(id: $account) {
            alerts {
              policiesSearch(searchCriteria: { name: $name }) {
                policies {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { account, name }
  );
  return data.actor.account.alerts.policiesSearch.policies.find((p) => p.name === name)?.id;
}

async function ensurePolicy(name: string, apply: boolean): Promise<string | undefined> {
  const existing = await findPolicy(name);
  if (existing) return existing;
  console.log(`+ policy "${name}"`);
  if (!apply) return undefined;
  const data = await graphql<{ alertsPolicyCreate: { id: string } }>(
    `
      mutation ($account: Int!, $name: String!) {
        alertsPolicyCreate(
          accountId: $account
          policy: { name: $name, incidentPreference: PER_CONDITION }
        ) {
          id
        }
      }
    `,
    { account, name }
  );
  return data.alertsPolicyCreate.id;
}

async function listConditions(policyId: string) {
  const data = await graphql<{
    actor: {
      account: {
        alerts: { nrqlConditionsSearch: { nrqlConditions: { id: string; name: string }[] } };
      };
    };
  }>(
    `
      query ($account: Int!, $policyId: ID!) {
        actor {
          account(id: $account) {
            alerts {
              nrqlConditionsSearch(searchCriteria: { policyId: $policyId }) {
                nrqlConditions {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { account, policyId }
  );
  return data.actor.account.alerts.nrqlConditionsSearch.nrqlConditions;
}

async function apply(applyChanges: boolean) {
  for (const policy of ['paging', 'monitor'] as const) {
    const name = policyName(policy);
    const policyId = await ensurePolicy(name, applyChanges);
    const existing = policyId ? await listConditions(policyId) : [];
    for (const c of CONDITIONS.filter((x) => x.policy === policy)) {
      const found = existing.find((e) => e.name === conditionName(c));
      console.log(`${found ? '~' : '+'} ${name} / ${conditionName(c)}`);
      console.log(`    ${c.nrql(env)}`);
      if (!applyChanges || !policyId) continue;
      const condition = conditionInput(c);
      if (found) {
        await graphql(
          `
            mutation ($account: Int!, $id: ID!, $condition: AlertsNrqlConditionUpdateStaticInput!) {
              alertsNrqlConditionStaticUpdate(accountId: $account, id: $id, condition: $condition) {
                id
              }
            }
          `,
          { account, id: found.id, condition }
        );
      } else {
        await graphql(
          `
            mutation ($account: Int!, $policyId: ID!, $condition: AlertsNrqlConditionStaticInput!) {
              alertsNrqlConditionStaticCreate(
                accountId: $account
                policyId: $policyId
                condition: $condition
              ) {
                id
              }
            }
          `,
          { account, policyId, condition }
        );
      }
    }
  }
  console.log(applyChanges ? '\n反映しました。' : '\n（差分の表示のみ。反映するには --apply）');
}

// ---- PagerDuty への通知経路（R7.4 / R7.7） ----
//
// Destination（PagerDuty の okiraku.chat サービス、Events API キー）は 1 つだけ作って共用する。
// Channel と Workflow は環境ごとに作る。
// - 初期版で PagerDuty に送るのは paging ポリシーの CRITICAL（C1）だけ。New Relic は Channel で
//   severity を指定できず、優先度から自動で決める。WARNING 条件（C4）は優先度 HIGH になり、
//   PagerDuty で高緊急度（error）として届くおそれがあるため、変換を確かめるまでは送らない
//   （design.md の代替案「Dynamic Notifications が使えない場合は C4 を送らない」と同じ扱い）。
// - クローズ（CLOSED）も通知し、PagerDuty 側のインシデントを Resolve させる。

const DESTINATION_NAME = 'PagerDuty okiraku.chat (New Relic)';
const channelName = `okiraku-chat paging${suffix}`;
const workflowName = `okiraku-chat paging -> PagerDuty${suffix}`;

async function findDestination(): Promise<string | undefined> {
  const data = await graphql<{
    actor: {
      account: { aiNotifications: { destinations: { entities: { id: string; name: string }[] } } };
    };
  }>(
    `
      query ($account: Int!) {
        actor {
          account(id: $account) {
            aiNotifications {
              destinations(filters: { type: PAGERDUTY_SERVICE_INTEGRATION }) {
                entities {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { account }
  );
  return data.actor.account.aiNotifications.destinations.entities.find(
    (d) => d.name === DESTINATION_NAME
  )?.id;
}

async function ensureDestination(): Promise<string> {
  const existing = await findDestination();
  if (existing) return existing;
  const token = process.env.PAGERDUTY_INTEGRATION_KEY;
  if (!token) throw new Error('PAGERDUTY_INTEGRATION_KEY が必要です（.env）');
  console.log(`+ destination "${DESTINATION_NAME}"`);
  const data = await graphql<{
    aiNotificationsCreateDestination: { destination: { id: string } | null; error: unknown };
  }>(
    `
      mutation ($account: Int!, $d: AiNotificationsDestinationInput!) {
        aiNotificationsCreateDestination(accountId: $account, destination: $d) {
          destination {
            id
          }
          error {
            ... on AiNotificationsResponseError {
              description
            }
          }
        }
      }
    `,
    {
      account,
      d: {
        type: 'PAGERDUTY_SERVICE_INTEGRATION',
        name: DESTINATION_NAME,
        properties: [],
        auth: { type: 'TOKEN', token: { prefix: '', token } },
      },
    }
  );
  const id = data.aiNotificationsCreateDestination.destination?.id;
  if (!id) throw new Error(JSON.stringify(data.aiNotificationsCreateDestination.error));
  return id;
}

async function findChannel(): Promise<string | undefined> {
  const data = await graphql<{
    actor: {
      account: { aiNotifications: { channels: { entities: { id: string; name: string }[] } } };
    };
  }>(
    `
      query ($account: Int!, $name: String!) {
        actor {
          account(id: $account) {
            aiNotifications {
              channels(filters: { name: $name }) {
                entities {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { account, name: channelName }
  );
  return data.actor.account.aiNotifications.channels.entities.find((c) => c.name === channelName)
    ?.id;
}

async function findWorkflow(): Promise<string | undefined> {
  const data = await graphql<{
    actor: {
      account: { aiWorkflows: { workflows: { entities: { id: string; name: string }[] } } };
    };
  }>(
    `
      query ($account: Int!, $name: String!) {
        actor {
          account(id: $account) {
            aiWorkflows {
              workflows(filters: { name: $name }) {
                entities {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    { account, name: workflowName }
  );
  return data.actor.account.aiWorkflows.workflows.entities.find((w) => w.name === workflowName)?.id;
}

async function ensurePagerDuty() {
  const policyId = await findPolicy(policyName('paging'));
  if (!policyId) throw new Error(`先に --apply でポリシー "${policyName('paging')}" を作る`);
  const destinationId = await ensureDestination();

  let channelId = await findChannel();
  if (!channelId) {
    console.log(`+ channel "${channelName}"`);
    const data = await graphql<{
      aiNotificationsCreateChannel: { channel: { id: string } | null; error: unknown };
    }>(
      `
        mutation ($account: Int!, $c: AiNotificationsChannelInput!) {
          aiNotificationsCreateChannel(accountId: $account, channel: $c) {
            channel {
              id
            }
            error {
              ... on AiNotificationsResponseError {
                description
              }
            }
          }
        }
      `,
      {
        account,
        c: {
          type: 'PAGERDUTY_SERVICE_INTEGRATION',
          name: channelName,
          destinationId,
          product: 'IINT',
          properties: [{ key: 'summary', value: '{{ annotations.title.[0] }}' }],
        },
      }
    );
    channelId = data.aiNotificationsCreateChannel.channel?.id;
    if (!channelId) throw new Error(JSON.stringify(data.aiNotificationsCreateChannel.error));
  }

  if (await findWorkflow()) {
    console.log(`= workflow "${workflowName}"（作成済み）`);
    return;
  }
  console.log(`+ workflow "${workflowName}"（policy ${policyId}、CRITICAL のみ）`);
  const data = await graphql<{
    aiWorkflowsCreateWorkflow: { workflow: { id: string } | null; errors: unknown[] };
  }>(
    `
      mutation ($account: Int!, $w: AiWorkflowsCreateWorkflowInput!) {
        aiWorkflowsCreateWorkflow(accountId: $account, createWorkflowData: $w) {
          workflow {
            id
          }
          errors {
            description
            type
          }
        }
      }
    `,
    {
      account,
      w: {
        name: workflowName,
        workflowEnabled: true,
        destinationsEnabled: true,
        enrichmentsEnabled: false,
        mutingRulesHandling: 'DONT_NOTIFY_FULLY_MUTED_ISSUES',
        issuesFilter: {
          name: workflowName,
          type: 'FILTER',
          predicates: [
            { attribute: 'labels.policyIds', operator: 'EXACTLY_MATCHES', values: [policyId] },
            { attribute: 'priority', operator: 'EQUAL', values: ['CRITICAL'] },
          ],
        },
        destinationConfigurations: [
          { channelId, notificationTriggers: ['ACTIVATED', 'ACKNOWLEDGED', 'CLOSED'] },
        ],
      },
    }
  );
  if (!data.aiWorkflowsCreateWorkflow.workflow) {
    throw new Error(JSON.stringify(data.aiWorkflowsCreateWorkflow.errors));
  }
}

async function removePagerDuty() {
  const workflowId = await findWorkflow();
  if (workflowId) {
    console.log(`- workflow "${workflowName}"`);
    await graphql(
      `
        mutation ($account: Int!, $id: ID!) {
          aiWorkflowsDeleteWorkflow(accountId: $account, id: $id, deleteChannels: true) {
            id
          }
        }
      `,
      { account, id: workflowId }
    );
  }
}

async function remove() {
  await removePagerDuty();
  for (const policy of ['paging', 'monitor'] as const) {
    const id = await findPolicy(policyName(policy));
    if (!id) continue;
    console.log(`- policy "${policyName(policy)}"`);
    await graphql(
      `
        mutation ($account: Int!, $id: ID!) {
          alertsPolicyDelete(accountId: $account, id: $id) {
            id
          }
        }
      `,
      { account, id }
    );
  }
}

if (flag('delete')) {
  if (env === 'production') {
    console.error('本番のポリシーは --delete で消さない（New Relic の画面で行う）');
    process.exit(2);
  }
  await remove();
} else if (flag('pagerduty')) {
  await ensurePagerDuty();
} else {
  await apply(flag('apply'));
}
