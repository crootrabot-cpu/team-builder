const dutyPool = document.getElementById('dutyPool');
const peoplePool = document.getElementById('peoplePool');
const rolesLayer = document.getElementById('rolesLayer');
const board = document.getElementById('orgBoard');
const linesSvg = document.getElementById('orgLines');
const boardEmpty = document.getElementById('boardEmpty');
const addDutyForm = document.getElementById('addDutyForm');
const addPersonForm = document.getElementById('addPersonForm');
const createRoleButton = document.getElementById('createRoleButton');
const resetBoardButton = document.getElementById('resetBoardButton');

const STORAGE_KEY = 'team-builder-pages-v1';

function uidSeed(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function defaultState() {
  const duties = [
    { id: uidSeed('duty'), text: 'Make sure all orders get shipped out.', color: palette[0] },
    { id: uidSeed('duty'), text: 'Ensure pickers are hitting their metrics.', color: palette[1] },
    { id: uidSeed('duty'), text: 'Ensure packers are hitting their metrics.', color: palette[2] },
    { id: uidSeed('duty'), text: 'Ensure all inbounds are done.', color: palette[3] },
    { id: uidSeed('duty'), text: 'Ensure all special projects get done.', color: palette[4] },
  ];
  const people = [
    { id: uidSeed('person'), name: 'Drake', strengths: 'Ops triage · bottleneck removal', accent: personColors[0] },
    { id: uidSeed('person'), name: 'Emily', strengths: 'Returns · detail work', accent: personColors[1] },
    { id: uidSeed('person'), name: 'Luis', strengths: 'Inventory · process discipline', accent: personColors[2] },
    { id: uidSeed('person'), name: 'Kody', strengths: 'Outbound tempo · floor urgency', accent: personColors[3] },
  ];
  const roleOne = {
    id: uidSeed('role'),
    name: 'Throughput anchor',
    title: '',
    person_id: people[0].id,
    x: 120,
    y: 120,
    reports_to_role_id: null,
    duties: [
      { id: uidSeed('assignment'), duty_id: duties[0].id, share: 45 },
      { id: uidSeed('assignment'), duty_id: duties[1].id, share: 30 },
      { id: uidSeed('assignment'), duty_id: duties[2].id, share: 25 },
    ],
  };
  const roleTwo = {
    id: uidSeed('role'),
    name: 'Inventory stabilizer',
    title: '',
    person_id: people[2].id,
    x: 470,
    y: 320,
    reports_to_role_id: roleOne.id,
    duties: [
      { id: uidSeed('assignment'), duty_id: duties[3].id, share: 70 },
      { id: uidSeed('assignment'), duty_id: duties[4].id, share: 30 },
    ],
  };
  return {
    version: 1,
    meta: { name: 'Team Builder', tagline: 'Match duties to strengths before titles.' },
    duties,
    people,
    roles: [roleOne, roleTwo],
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw);
  } catch (error) {
    return defaultState();
  }
}

const state = loadState();
const palette = ['#295C52', '#457B6E', '#E09F3E', '#9C6644', '#875F9A', '#3F6CA8', '#D06C72'];
const personColors = ['#0E7490', '#B45309', '#7C3AED', '#BE185D', '#2563EB', '#2F855A'];
let saveTimer = null;
let dragPayload = null;
let roleMove = null;

const metricsNodes = {
  duties: document.querySelector('[data-duty-count]'),
  people: document.querySelector('[data-people-count]'),
  roles: document.querySelector('[data-role-count]'),
  assigned: document.querySelector('[data-assigned-duty-count]'),
  coverage: document.querySelector('[data-coverage]'),
};

function uid(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function dutyById(id) {
  return state.duties.find((duty) => duty.id === id);
}

function personById(id) {
  return state.people.find((person) => person.id === id);
}

function roleById(id) {
  return state.roles.find((role) => role.id === id);
}

function assignmentsForDuty(dutyId) {
  return state.roles.flatMap((role) => role.duties.filter((assignment) => assignment.duty_id === dutyId).map((assignment) => ({ role, assignment })));
}

function usedDutyIds() {
  return new Set(state.roles.flatMap((role) => role.duties.map((assignment) => assignment.duty_id)));
}

function coveragePct() {
  if (!state.duties.length) return 0;
  return Math.round((usedDutyIds().size / state.duties.length) * 100);
}

function normalizeRoleShares(role) {
  const total = role.duties.reduce((sum, item) => sum + Number(item.share || 0), 0) || 1;
  return role.duties.map((item) => ({ ...item, pct: Math.round((Number(item.share || 0) / total) * 100) }));
}

function dutyGradient(role) {
  if (!role.duties.length) {
    return 'conic-gradient(#d9e2dd 0deg 360deg)';
  }
  const normalized = normalizeRoleShares(role);
  let current = 0;
  const stops = normalized.map((item) => {
    const duty = dutyById(item.duty_id);
    const color = duty?.color || '#A0A7A3';
    const start = current;
    current += item.pct * 3.6;
    return `${color} ${start}deg ${current}deg`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {}
  }, 180);
}

function setDrag(type, payload, event) {
  dragPayload = { type, ...payload };
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
  }
}

function clearDropHighlights() {
  document.querySelectorAll('.is-active, .is-drop-target').forEach((node) => node.classList.remove('is-active', 'is-drop-target'));
}

function ensureRoleDefaults(role) {
  role.title = role.title || '';
  role.duties = role.duties || [];
  if (typeof role.x !== 'number') role.x = 100;
  if (typeof role.y !== 'number') role.y = 100;
}

function render() {
  renderDutyPool();
  renderPeoplePool();
  renderRoles();
  renderLines();
  renderMetrics();
}

function renderMetrics() {
  const assignedCount = usedDutyIds().size;
  if (metricsNodes.duties) metricsNodes.duties.textContent = `${state.duties.length} duties`;
  if (metricsNodes.people) metricsNodes.people.textContent = `${state.people.length} people`;
  if (metricsNodes.roles) metricsNodes.roles.textContent = String(state.roles.length);
  if (metricsNodes.assigned) metricsNodes.assigned.textContent = String(assignedCount);
  if (metricsNodes.coverage) metricsNodes.coverage.textContent = `${coveragePct()}%`;
  if (boardEmpty) boardEmpty.hidden = state.roles.length > 0;
}

function renderDutyPool() {
  if (!dutyPool) return;
  dutyPool.innerHTML = '';
  state.duties.forEach((duty) => {
    const placements = assignmentsForDuty(duty.id);
    const card = document.createElement('article');
    card.className = 'pool-card';
    card.draggable = true;
    card.addEventListener('dragstart', (event) => setDrag('duty', { dutyId: duty.id }, event));
    card.innerHTML = `
      <div class="pool-meta">
        <span class="mini-badge">${placements.length ? `${placements.length} role${placements.length > 1 ? 's' : ''}` : 'unassigned'}</span>
        <button class="mini-button" type="button" data-delete-duty="${duty.id}">Delete</button>
      </div>
      <div class="pool-copy">
        <span class="color-dot" style="background:${duty.color}"></span>
        <div>${duty.text}</div>
      </div>
    `;
    dutyPool.appendChild(card);
  });
  dutyPool.querySelectorAll('[data-delete-duty]').forEach((button) => {
    button.addEventListener('click', () => deleteDuty(button.dataset.deleteDuty));
  });
}

function renderPeoplePool() {
  if (!peoplePool) return;
  peoplePool.innerHTML = '';
  state.people.forEach((person) => {
    const assigned = state.roles.find((role) => role.person_id === person.id);
    const card = document.createElement('article');
    card.className = 'pool-card';
    card.draggable = true;
    card.addEventListener('dragstart', (event) => setDrag('person', { personId: person.id }, event));
    card.innerHTML = `
      <div class="pool-meta">
        <span class="mini-badge">${assigned ? `in ${assigned.name || 'role'}` : 'available'}</span>
        <button class="mini-button" type="button" data-delete-person="${person.id}">Delete</button>
      </div>
      <div class="pool-copy">
        <span class="color-dot" style="background:${person.accent}"></span>
        <div>
          <strong>${person.name}</strong>
          <div class="muted">${person.strengths || 'No strengths added yet.'}</div>
        </div>
      </div>
    `;
    peoplePool.appendChild(card);
  });
  peoplePool.querySelectorAll('[data-delete-person]').forEach((button) => {
    button.addEventListener('click', () => deletePerson(button.dataset.deletePerson));
  });
}

function roleCardTemplate(role) {
  ensureRoleDefaults(role);
  const normalized = normalizeRoleShares(role);
  const assignedPerson = personById(role.person_id);
  const dutyMarkup = role.duties.length
    ? normalized.map((assignment) => {
        const duty = dutyById(assignment.duty_id);
        if (!duty) return '';
        return `
          <div class="duty-chip" draggable="true" data-assignment-id="${assignment.id}" data-role-id="${role.id}">
            <div class="duty-top">
              <div class="pool-copy">
                <span class="color-dot" style="background:${duty.color}"></span>
                <p>${duty.text}</p>
              </div>
              <button class="mini-button" type="button" data-remove-assignment="${role.id}:${assignment.id}">Remove</button>
            </div>
            <div class="share-row">
              <input type="range" min="5" max="100" value="${assignment.share}" data-share-slider="${role.id}:${assignment.id}" />
              <span class="share-badge">${assignment.pct}%</span>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="footer-note">Drop duties here to shape the actual job before you overthink the title.</div>';
  const reportOptions = ['<option value="">Top of chart</option>']
    .concat(state.roles.filter((candidate) => candidate.id !== role.id).map((candidate) => `<option value="${candidate.id}" ${candidate.id === role.reports_to_role_id ? 'selected' : ''}>${candidate.name || 'Untitled role'}</option>`))
    .join('');
  const titleText = role.title?.trim() ? role.title : 'Title still loose';
  const assignedDutyCount = role.duties.length;
  return `
    <div class="role-head">
      <div>
        <div class="mini-badge">${assignedDutyCount} duty${assignedDutyCount === 1 ? '' : 'ies'} · ${assignedPerson ? 'assigned' : 'open'}</div>
      </div>
      <div class="role-actions">
        <span class="role-drag-handle" data-role-drag-handle="${role.id}">Move</span>
        <button class="mini-button" type="button" data-delete-role="${role.id}">Delete</button>
      </div>
    </div>
    <div class="role-name-grid">
      <input type="text" value="${role.name || ''}" data-role-name="${role.id}" placeholder="Role focus" />
      <input type="text" value="${role.title || ''}" data-role-title="${role.id}" placeholder="Optional title later" />
    </div>
    <div class="role-summary">
      <div class="pie-chart" style="background:${dutyGradient(role)}"></div>
      <div class="summary-box">
        <div class="mini-badge">${titleText}</div>
        <strong>${normalized.reduce((sum, item) => sum + item.pct, 0)}%</strong>
        <div class="muted">Workload mix across this role. Sliders below rebalance the pie instantly.</div>
      </div>
    </div>
    <div class="drop-slot" data-person-slot="${role.id}">
      ${assignedPerson ? `
        <div class="person-pill" draggable="true" data-role-person-pill="${role.id}">
          <span class="color-dot" style="background:${assignedPerson.accent}"></span>
          <strong>${assignedPerson.name}</strong>
          <span>${assignedPerson.strengths || 'No strengths listed'}</span>
        </div>
        <div class="person-row">
          <button class="mini-button" type="button" data-clear-person="${role.id}">Clear person</button>
        </div>
      ` : '<div class="footer-note">Drop a person here. Start with strengths, not job titles.</div>'}
    </div>
    <div class="drop-slot" data-duty-slot="${role.id}">
      <div class="duty-list">${dutyMarkup}</div>
    </div>
    <div class="role-footer">
      <div class="link-selects">
        <label>
          Reports to
          <select data-reports-to="${role.id}">${reportOptions}</select>
        </label>
      </div>
      <div class="footer-note">Drag this card around the board. The line updates after you choose who it reports to.</div>
    </div>
  `;
}

function renderRoles() {
  if (!rolesLayer) return;
  rolesLayer.innerHTML = '';
  state.roles.forEach((role) => {
    ensureRoleDefaults(role);
    const card = document.createElement('article');
    card.className = 'role-card';
    card.dataset.roleId = role.id;
    card.style.left = `${role.x}px`;
    card.style.top = `${role.y}px`;
    card.innerHTML = roleCardTemplate(role);
    rolesLayer.appendChild(card);
  });
  wireRoleEvents();
}

function wireRoleEvents() {
  rolesLayer.querySelectorAll('[data-role-name]').forEach((input) => {
    input.addEventListener('input', () => {
      const role = roleById(input.dataset.roleName);
      role.name = input.value;
      saveState();
      renderMetrics();
      renderLines();
    });
  });
  rolesLayer.querySelectorAll('[data-role-title]').forEach((input) => {
    input.addEventListener('input', () => {
      const role = roleById(input.dataset.roleTitle);
      role.title = input.value;
      saveState();
    });
  });
  rolesLayer.querySelectorAll('[data-share-slider]').forEach((slider) => {
    slider.addEventListener('input', () => {
      const [roleId, assignmentId] = slider.dataset.shareSlider.split(':');
      const role = roleById(roleId);
      const assignment = role?.duties.find((item) => item.id === assignmentId);
      if (!assignment) return;
      assignment.share = Number(slider.value);
      renderRoles();
      renderLines();
      saveState();
    });
  });
  rolesLayer.querySelectorAll('[data-remove-assignment]').forEach((button) => {
    button.addEventListener('click', () => {
      const [roleId, assignmentId] = button.dataset.removeAssignment.split(':');
      const role = roleById(roleId);
      if (!role) return;
      role.duties = role.duties.filter((item) => item.id !== assignmentId);
      render();
      saveState();
    });
  });
  rolesLayer.querySelectorAll('[data-delete-role]').forEach((button) => {
    button.addEventListener('click', () => deleteRole(button.dataset.deleteRole));
  });
  rolesLayer.querySelectorAll('[data-clear-person]').forEach((button) => {
    button.addEventListener('click', () => {
      const role = roleById(button.dataset.clearPerson);
      if (!role) return;
      role.person_id = null;
      render();
      saveState();
    });
  });
  rolesLayer.querySelectorAll('[data-reports-to]').forEach((select) => {
    select.addEventListener('change', () => {
      const role = roleById(select.dataset.reportsTo);
      role.reports_to_role_id = select.value || null;
      renderLines();
      saveState();
    });
  });
  rolesLayer.querySelectorAll('[data-duty-slot], [data-person-slot]').forEach((slot) => {
    slot.addEventListener('dragover', (event) => {
      event.preventDefault();
      slot.classList.add('is-active');
      slot.closest('.role-card')?.classList.add('is-drop-target');
    });
    slot.addEventListener('dragleave', () => clearDropHighlights());
    slot.addEventListener('drop', (event) => {
      event.preventDefault();
      const roleId = slot.dataset.dutySlot || slot.dataset.personSlot;
      if (!dragPayload || !roleId) return;
      if (slot.dataset.dutySlot && (dragPayload.type === 'duty' || dragPayload.type === 'role-duty')) {
        attachDutyToRole(dragPayload, roleId);
      }
      if (slot.dataset.personSlot && dragPayload.type === 'person') {
        attachPersonToRole(dragPayload.personId, roleId);
      }
      clearDropHighlights();
    });
  });
  rolesLayer.querySelectorAll('.duty-chip[draggable="true"]').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => setDrag('role-duty', { roleId: chip.dataset.roleId, assignmentId: chip.dataset.assignmentId }, event));
  });
  rolesLayer.querySelectorAll('[data-role-person-pill]').forEach((pill) => {
    pill.addEventListener('dragstart', (event) => {
      const role = roleById(pill.dataset.rolePersonPill);
      if (!role?.person_id) return;
      setDrag('person', { personId: role.person_id }, event);
      role.person_id = null;
      saveState();
      render();
    });
  });
  rolesLayer.querySelectorAll('[data-role-drag-handle]').forEach((handle) => {
    handle.addEventListener('pointerdown', startRoleMove);
  });
}

function renderLines() {
  if (!linesSvg || !board) return;
  const boardRect = board.getBoundingClientRect();
  linesSvg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
  linesSvg.innerHTML = state.roles.map((role) => {
    if (!role.reports_to_role_id) return '';
    const parentNode = rolesLayer.querySelector(`[data-role-id="${role.reports_to_role_id}"]`);
    const childNode = rolesLayer.querySelector(`[data-role-id="${role.id}"]`);
    if (!parentNode || !childNode) return '';
    const parentRect = parentNode.getBoundingClientRect();
    const childRect = childNode.getBoundingClientRect();
    const x1 = parentRect.left - boardRect.left + (parentRect.width / 2);
    const y1 = parentRect.top - boardRect.top + parentRect.height;
    const x2 = childRect.left - boardRect.left + (childRect.width / 2);
    const y2 = childRect.top - boardRect.top;
    const midY = y1 + Math.max(34, (y2 - y1) / 2);
    return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" stroke="#53756b" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.9"></path>`;
  }).join('');
}

function addDuty(text) {
  state.duties.unshift({ id: uid('duty'), text, color: palette[state.duties.length % palette.length] });
  render();
  saveState();
}

function addPerson(name, strengths) {
  state.people.unshift({ id: uid('person'), name, strengths, accent: personColors[state.people.length % personColors.length] });
  render();
  saveState();
}

function createRole() {
  state.roles.push({
    id: uid('role'),
    name: 'New role',
    title: '',
    person_id: null,
    x: 140 + (state.roles.length % 3) * 80,
    y: 120 + state.roles.length * 42,
    reports_to_role_id: null,
    duties: [],
  });
  render();
  saveState();
}

function attachDutyToRole(payload, targetRoleId) {
  const role = roleById(targetRoleId);
  if (!role) return;
  let dutyId = payload.dutyId;
  if (payload.type === 'role-duty') {
    const sourceRole = roleById(payload.roleId);
    const assignment = sourceRole?.duties.find((item) => item.id === payload.assignmentId);
    if (!assignment) return;
    dutyId = assignment.duty_id;
    sourceRole.duties = sourceRole.duties.filter((item) => item.id !== payload.assignmentId);
  }
  if (role.duties.some((item) => item.duty_id === dutyId)) {
    render();
    saveState();
    return;
  }
  role.duties.push({ id: uid('assignment'), duty_id: dutyId, share: role.duties.length ? 25 : 100 });
  render();
  saveState();
}

function attachPersonToRole(personId, targetRoleId) {
  state.roles.forEach((role) => {
    if (role.person_id === personId) role.person_id = null;
  });
  const role = roleById(targetRoleId);
  if (!role) return;
  role.person_id = personId;
  render();
  saveState();
}

function deleteDuty(dutyId) {
  state.duties = state.duties.filter((duty) => duty.id !== dutyId);
  state.roles.forEach((role) => {
    role.duties = role.duties.filter((assignment) => assignment.duty_id !== dutyId);
  });
  render();
  saveState();
}

function deletePerson(personId) {
  state.people = state.people.filter((person) => person.id !== personId);
  state.roles.forEach((role) => {
    if (role.person_id === personId) role.person_id = null;
  });
  render();
  saveState();
}

function deleteRole(roleId) {
  state.roles = state.roles.filter((role) => role.id !== roleId);
  state.roles.forEach((role) => {
    if (role.reports_to_role_id === roleId) role.reports_to_role_id = null;
  });
  render();
  saveState();
}

function startRoleMove(event) {
  const handle = event.currentTarget;
  const card = handle.closest('.role-card');
  if (!card || !board) return;
  const roleId = card.dataset.roleId;
  const role = roleById(roleId);
  if (!role) return;
  const boardRect = board.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  roleMove = {
    roleId,
    offsetX: event.clientX - cardRect.left,
    offsetY: event.clientY - cardRect.top,
    boardRect,
  };
  card.dataset.dragging = 'true';
  handle.setPointerCapture(event.pointerId);
}

window.addEventListener('pointermove', (event) => {
  if (!roleMove) return;
  const role = roleById(roleMove.roleId);
  const card = rolesLayer.querySelector(`[data-role-id="${roleMove.roleId}"]`);
  if (!role || !card) return;
  const maxX = board.clientWidth - card.offsetWidth - 12;
  const maxY = board.clientHeight - card.offsetHeight - 12;
  role.x = Math.max(12, Math.min(maxX, event.clientX - roleMove.boardRect.left - roleMove.offsetX));
  role.y = Math.max(12, Math.min(maxY, event.clientY - roleMove.boardRect.top - roleMove.offsetY));
  card.style.left = `${role.x}px`;
  card.style.top = `${role.y}px`;
  renderLines();
});

window.addEventListener('pointerup', () => {
  if (!roleMove) return;
  const card = rolesLayer.querySelector(`[data-role-id="${roleMove.roleId}"]`);
  if (card) delete card.dataset.dragging;
  roleMove = null;
  saveState();
});

window.addEventListener('resize', renderLines);
window.addEventListener('dragend', clearDropHighlights);

if (addDutyForm) {
  addDutyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const field = document.getElementById('newDutyText');
    const text = field.value.trim();
    if (!text) return;
    addDuty(text);
    field.value = '';
  });
}

if (addPersonForm) {
  addPersonForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const nameField = document.getElementById('newPersonName');
    const strengthsField = document.getElementById('newPersonStrengths');
    const name = nameField.value.trim();
    const strengths = strengthsField.value.trim();
    if (!name) return;
    addPerson(name, strengths);
    nameField.value = '';
    strengthsField.value = '';
  });
}

if (createRoleButton) createRoleButton.addEventListener('click', createRole);
if (resetBoardButton) {
  resetBoardButton.addEventListener('click', () => {
    const next = defaultState();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, next);
    saveState();
    render();
  });
}

render();
