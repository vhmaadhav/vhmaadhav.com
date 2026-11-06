// Agent-facing outputs built from dist/content.json, the single source of truth:
//   llms.txt        llmstxt.org index
//   llms-full.txt   everything in content.json as markdown
//   resume.json     JSON Resume (https://jsonresume.org/schema)
//   for-agents.txt  key facts, each with the link that checks it
//   JSON-LD         Person, ProfilePage and project graph for the home page
// build.mjs calls agentFiles() once and writes the strings it returns.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SUMMARY = 'AI/ML engineer focused on on-device AI · ECE undergraduate at KPRIET, graduating 2028 · open to AI/ML and on-device AI internships';

export function agentFiles({ data, now, today, ogImage, durationLabel, distDir }) {
  const base = data.site.url.replace(/\/+$/, '');
  const home = `${base}/`;
  const c = {
    data,
    base,
    home,
    personId: `${home}#person`,
    now,
    today,
    ogImage,
    durationLabel,
    leetcode: readLeetcode(distDir)
  };
  return {
    llms: llmsTxt(c),
    llmsFull: llmsFullTxt(c),
    resumeJson: `${JSON.stringify(resumeJson(c), null, 2)}\n`,
    forAgents: forAgentsTxt(c),
    jsonLd: jsonLd(c)
  };
}

// ---- shared helpers -------------------------------------------------------

function readLeetcode(distDir) {
  const file = path.join(distDir, 'leetcode.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const sentence = (s) => (/[.!?)"”’]$/.test(s) ? s : `${s}.`);
const linkOf = (data, label) => data.profile.links.find((l) => l.label === label)?.url;
const lastSegment = (url) => url.split('/').filter(Boolean).pop();
const absolute = (base, url) => (/^(https?:|mailto:)/.test(url) ? url : `${base}/${url.replace(/^\/+/, '')}`);
const caseStudyUrl = (base, p) => (p.caseStudy ? `${base}${p.caseStudy.replace(/\/+$/, '')}/` : null);
// llms.txt: case study, else public repo, else the work section.
const projectLink = (base, p) => caseStudyUrl(base, p) || p.url || `${base}/#work`;
const cleanCode = (code) => code.replace(/\s*↗/g, '');
const isPrivate = (p) => /private/.test(p.code || '');
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "Sep 2026" -> "2026-09"; "2026" stays "2026".
function isoDate(text) {
  const t = text.trim();
  if (/^\d{4}$/.test(t)) return t;
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(t);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (month < 0) throw new Error(`content.json: unrecognised date "${text}"`);
  return `${m[2]}-${String(month + 1).padStart(2, '0')}`;
}

// Every outside link the site makes, for the verification lists.
function evidenceLinks({ data, base }) {
  const links = [];
  for (const w of data.wins) {
    if (w.source) links.push({ label: `${w.event} (${w.date})`, url: w.source });
  }
  for (const p of data.projects) {
    const study = caseStudyUrl(base, p);
    if (study) links.push({ label: `${p.title} case study`, url: study });
    if (p.url) links.push({ label: `${p.title} public code`, url: p.url });
  }
  for (const p of data.building || []) {
    if (p.url) links.push({ label: `${p.title} public code`, url: p.url });
  }
  for (const m of data.moreProjects) links.push({ label: `${m.name} (public code)`, url: m.url });
  for (const l of data.profile.links) {
    const url = l.label === 'email' ? l.url : absolute(base, l.url);
    links.push({ label: `${l.label}`, url });
  }
  return links;
}

function fixedWidthTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ').trimEnd();
  const rule = widths.map((w) => '-'.repeat(w)).join('-+-');
  return [fmt(headers), rule, ...rows.map(fmt)].join('\n');
}

// ---- llms.txt (https://llmstxt.org) ---------------------------------------

function llmsTxt(c) {
  const { data, base, home, now, durationLabel } = c;
  const { profile, site } = data;
  const lines = [
    `# ${profile.name}`,
    '',
    `> ${SUMMARY}`,
    '',
    `${profile.bio.join(' ')} Based in ${profile.location}, India.`,
    '',
    '## Work',
    ...data.projects.map((p) => {
      const name = `[${p.title}](${projectLink(base, p)})`;
      return `- ${name}: ${sentence(p.what)} Result: ${sentence(p.proof)}`;
    }),
    `- Also public on GitHub: ${data.moreProjects.map((m) => `[${m.name}](${m.url})`).join(', ')}.`,
    '',
    '## Currently working',
    ...(data.building || []).map((p) => {
      const name = `[${p.title}](${p.url || `${base}/#now`})`;
      return `- ${name}: ${sentence(p.what)} Status: ${sentence(p.status)}`;
    }),
    '',
    '## Awards',
    ...data.wins.map((w) => {
      const source = w.source ? ` ([source](${w.source}))` : '';
      return `- ${w.date}: ${w.event}. ${sentence(w.result)}${source}`;
    }),
    '',
    '## Experience',
    ...data.experience.map((j) => {
      const span = `${j.start} to ${j.end || 'present'}, ${durationLabel(j.start, j.end, now)}`;
      return `- ${j.role}, ${j.company} (${span})${j.description ? `: ${j.description}` : ''}`;
    }),
    '',
    '## Links',
    `- site: ${home}`,
    `- résumé (PDF): ${absolute(base, linkOf(data, 'resume'))}`,
    `- GitHub: ${linkOf(data, 'github')}`,
    `- LinkedIn: ${linkOf(data, 'linkedin')}`,
    `- LeetCode: ${linkOf(data, 'leetcode')}`,
    `- email: ${linkOf(data, 'email').replace(/^mailto:/, '')}`,
    `- JSON Resume: ${base}/resume.json`,
    `- agent facts: ${base}/for-agents.txt`,
    `- full text: ${base}/llms-full.txt`,
    '',
    '## Optional',
    `- Education: ${data.education[0].title}. ${data.education[0].subtitle}. ${data.education[0].dates}.`,
    ...data.skills.map((s) => `- Skills, ${s.group}: ${s.items.join(', ')}`),
    `- Credentials: ${data.credentials.join('; ')}.`,
    ''
  ];
  return lines.join('\n');
}

// ---- llms-full.txt --------------------------------------------------------

function llmsFullTxt(c) {
  const { data, base, home, now, durationLabel } = c;
  const { profile, site } = data;
  const out = [];
  const section = (title) => out.push(`## ${title}`, '');
  const item = (title) => out.push(`### ${title}`, '');
  const bullets = (lines) => {
    for (const line of lines.filter(Boolean)) out.push(`- ${line}`);
    out.push('');
  };

  out.push(`# ${profile.name}`, '', `> ${SUMMARY}`, '', profile.bio.join(' '), '');
  bullets([
    `Site title: ${site.title}`,
    `Role: ${profile.role}`,
    `Status: ${profile.status}`,
    `Location: ${profile.location}, India`,
    `Email: ${linkOf(data, 'email').replace(/^mailto:/, '')}`,
    `Site: ${home}`,
    `Résumé (PDF): ${absolute(base, linkOf(data, 'resume'))}`,
    `GitHub: ${linkOf(data, 'github')}`,
    `LinkedIn: ${linkOf(data, 'linkedin')}`,
    `LeetCode: ${linkOf(data, 'leetcode')}`
  ]);

  section('Projects');
  for (const p of data.projects) {
    item(p.title);
    bullets([
      `What: ${p.what}`,
      p.role && `Role: ${p.role}`,
      `Result: ${p.proof}`,
      p.tag && `Tag: ${p.tag}`,
      p.code && `Code: ${cleanCode(p.code)}`,
      caseStudyUrl(base, p) && `Case study: ${caseStudyUrl(base, p)}`,
      p.url && `Public repository: ${p.url}`
    ]);
  }

  section('Currently working');
  for (const p of data.building || []) {
    item(p.title);
    bullets([
      `What: ${p.what}`,
      `Status: ${p.status}`,
      p.code && `Code: ${cleanCode(p.code)}`,
      p.url && `Public repository: ${p.url}`
    ]);
  }

  section('More public repositories');
  bullets(data.moreProjects.map((m) => `[${m.name}](${m.url})`));

  section('Headline results');
  bullets(data.proofs.map((v) => {
    const note = v.note ? ` (${v.note})` : '';
    const link = v.link ? ` Link: ${absolute(base, v.link.url)}` : '';
    return `${v.value}: ${v.text}${note}.${link}`;
  }));

  section('Awards');
  bullets(data.wins.map((w) => {
    const source = w.source ? ` Source: ${w.source}` : '';
    return `${w.date}: ${w.event}. ${sentence(w.result)}${source}`;
  }));

  section('Experience');
  for (const j of data.experience) {
    item(`${j.role}, ${j.company}`);
    bullets([
      `Dates: ${j.start} to ${j.end || 'present'} (${durationLabel(j.start, j.end, now)})`,
      j.description && `Summary: ${j.description}`
    ]);
  }

  section('Education');
  for (const e of data.education) {
    item(e.title);
    bullets([`Program: ${e.subtitle}`, `Dates: ${e.dates}`]);
  }

  section('Skills');
  bullets(data.skills.map((s) => `${s.group}: ${s.items.join(', ')}`));

  section('Credentials');
  bullets(data.credentials);

  section('Off-hours');
  bullets([`Films: ${data.offHours.films}`, `Note: ${data.offHours.quip}`]);

  section('Verification');
  bullets(evidenceLinks(c).map((l) => `${l.label}: ${l.url}`));

  return out.join('\n');
}

// ---- resume.json (JSON Resume schema) -------------------------------------

function resumeJson(c) {
  const { data, base, home, now } = c;
  const { profile, site } = data;
  const [city = '', region = ''] = profile.location.split(',').map((s) => s.trim());
  const github = linkOf(data, 'github');
  const linkedin = linkOf(data, 'linkedin');
  const leetcode = linkOf(data, 'leetcode');
  const edu = data.education[0];
  const cgpa = /CGPA\s*([\d.]+)/.exec(edu.subtitle)?.[1];

  return {
    basics: {
      name: profile.name,
      label: 'AI/ML Engineer · On-Device AI',
      email: linkOf(data, 'email').replace(/^mailto:/, ''),
      url: home,
      summary: `${site.description} ECE undergraduate at KPR Institute of Engineering and Technology, graduating 2028, open to internships.`,
      location: { city, region, countryCode: 'IN' },
      profiles: [
        { network: 'GitHub', username: lastSegment(github), url: github },
        { network: 'LinkedIn', username: lastSegment(linkedin), url: linkedin },
        { network: 'LeetCode', username: lastSegment(leetcode), url: leetcode }
      ]
    },
    work: data.experience.map((j) => ({
      name: j.company,
      position: j.role,
      startDate: j.start,
      ...(j.end ? { endDate: j.end } : {}),
      highlights: j.description ? [j.description] : []
    })),
    education: [
      {
        institution: edu.title.split(',')[0].trim(),
        area: 'Electronics and Communication Engineering (Honours in IoT for Smart Systems)',
        studyType: 'B.E.',
        startDate: '2024-09',
        endDate: '2028-06',
        ...(cgpa ? { score: cgpa } : {})
      }
    ],
    awards: data.wins.map((w) => ({
      title: w.event,
      date: isoDate(w.date),
      summary: sentence(w.result)
    })),
    projects: data.projects.map((p) => {
      const url = caseStudyUrl(base, p) || p.url;
      return {
        name: p.title,
        description: p.what,
        highlights: [p.proof, p.code && cleanCode(p.code)].filter(Boolean),
        keywords: p.tag ? [p.tag] : [],
        ...(url ? { url } : {}),
        ...(p.role ? { roles: [p.role] } : {})
      };
    }),
    skills: data.skills.map((s) => ({ name: s.group, keywords: s.items })),
    certificates: data.credentials.map((name) => ({ name })),
    meta: {
      canonical: `${base}/resume.json`,
      lastModified: now.toISOString()
    }
  };
}

// ---- for-agents.txt -------------------------------------------------------

function forAgentsTxt(c) {
  const { data, base, home, today, leetcode } = c;
  const { profile } = data;
  const find = (list, pred, what) => {
    const hit = list.find(pred);
    if (!hit) throw new Error(`content.json: no ${what} for for-agents.txt`);
    return hit;
  };
  const semicon = find(data.wins, (w) => w.event.startsWith('SEMICON India'), 'SEMICON India win');
  const driftsense = find(data.projects, (p) => p.title === 'DriftSense', 'DriftSense project');
  const vehicle = find(data.projects, (p) => p.title === 'VehicleGPT', 'VehicleGPT project');
  const dtGuardian = find(data.projects, (p) => p.title === 'DT Guardian', 'DT Guardian project');
  const hiver = find(data.moreProjects, (m) => m.name.startsWith('hiver'), 'hiver repo');
  const gemma = find(data.moreProjects, (m) => m.name.startsWith('embeddinggemma'), 'embeddinggemma repo');
  const caterpillar = find(data.wins, (w) => w.event.startsWith('Caterpillar'), 'Caterpillar win');
  const github = linkOf(data, 'github');
  const leetcodeUrl = linkOf(data, 'leetcode');
  const solved = leetcode?.solved?.all;

  const rows = [
    ['SEMICON India 2026 runner-up', semicon.result, semicon.source, 'third-party'],
    ['DriftSense match F1', '0.91 on 2,250 pairs', driftsense.url, 'public code'],
    ['Hiver email suggested response: held-out eval', 'see repository', hiver.url, 'public code'],
    ['EmbeddingGemma mobile benchmark', 'in progress', gemma.url, 'public code'],
    ['Caterpillar Tech Challenge 2026', 'top 10 of ~1,500 teams', 'organiser email (not published)', 'self-reported'],
    ['VehicleGPT hybrid rules + small LLM, 200 car-signal questions', '29.5% → 95.5%', caseStudyUrl(base, vehicle), 'self-reported'],
    ['DT Guardian energy not served, 6 h outage', '121.2 → 56.7 kWh (−53%)', caseStudyUrl(base, dtGuardian), 'self-reported (simulation)'],
    ['GitHub activity', 'public profile', github, 'live'],
    ['LeetCode problems solved', solved === undefined ? 'see profile' : `${solved} solved`, leetcodeUrl, 'live']
  ];

  const privateNames = data.projects.filter(isPrivate).map((p) => p.title);

  const lines = [
    `# plain facts about ${profile.name}, each with a link you can check`,
    `# same facts as the human page at ${home}`,
    `# last checked ${today}`,
    '',
    `name: ${profile.name}`,
    `role: AI/ML Engineer · On-Device AI`,
    `seeking: ${profile.status}`,
    `graduating: 2028 (B.E. Electronics and Communication Engineering, KPR Institute of Engineering and Technology)`,
    `location: ${profile.location}, India`,
    `contact: ${linkOf(data, 'email').replace(/^mailto:/, '')}`,
    `site: ${home}`,
    '',
    'claims → evidence',
    '',
    fixedWidthTable(['claim', 'value', 'evidence', 'type'], rows),
    '',
    `private code (not public): ${privateNames.join(', ')}. Table rows about these link to a case study or are self-reported.`,
    ''
  ];
  return lines.join('\n');
}

// ---- JSON-LD graph for the home page --------------------------------------

function jsonLd(c) {
  const { data, base, home, personId, ogImage, today } = c;
  const { profile, site } = data;
  const emailLink = linkOf(data, 'email');
  const sameAs = ['github', 'linkedin', 'leetcode'].map((l) => linkOf(data, l)).filter(Boolean);
  const [locality = '', region = ''] = profile.location.split(',').map((s) => s.trim());
  const college = (data.education[0]?.title || '').split(',')[0].trim();

  const person = {
    '@type': 'Person',
    '@id': personId,
    name: profile.name,
    alternateName: ['Maadhav VH', profile.handle, 'Maadhav'],
    jobTitle: 'AI/ML Engineer',
    description: `${site.description} ECE undergraduate graduating 2028, open to internships.`,
    url: home,
    image: ogImage,
    ...(emailLink ? { email: emailLink } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality,
      addressRegion: region,
      addressCountry: 'IN'
    },
    affiliation: { '@type': 'CollegeOrUniversity', name: college },
    knowsAbout: [
      'machine learning', 'deep learning', 'LLMs', 'on-device AI', 'computer vision',
      'RAG', 'edge AI', 'embedded systems', 'PyTorch', 'ONNX', 'llama.cpp'
    ],
    award: data.wins.map((w) => `${w.event} — ${w.result} (${w.date})`),
    sameAs
  };

  const projectNodes = data.projects.map((p) => ({
    '@type': 'SoftwareSourceCode',
    '@id': `${home}#project-${slug(p.title)}`,
    name: p.title,
    description: p.what,
    url: caseStudyUrl(base, p) || `${home}#work`,
    ...(p.url ? { codeRepository: p.url } : {}),
    author: { '@id': personId }
  }));

  const profilePage = {
    '@type': 'ProfilePage',
    '@id': `${home}#profilepage`,
    url: home,
    name: site.title,
    description: site.description,
    inLanguage: 'en',
    dateModified: today,
    mainEntity: { '@id': personId }
  };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [profilePage, person, ...projectNodes]
  };

  // Escape characters that could close the script tag or break HTML parsing.
  // The escapes are valid JSON string escapes, so JSON.parse still reads them.
  const json = JSON.stringify(graph, null, 2)
    .replace(/[<>&]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `<script type="application/ld+json">\n${json}\n  </script>`;
}
