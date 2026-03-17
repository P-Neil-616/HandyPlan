document.addEventListener("DOMContentLoaded", () => {

  let draftJob = {
    title: "",
    invoiceNumber: null,

    travelMiles: "",
    travelRate: "",

    durationMins: "",          // quoted duration
    durationRate: "",

    actualDurationMins: null,  // filled when completed (if timed)

    people: [],
    tools: [],
    inventory: [],

    notes: "",

    // timer state (belongs to this job)
    timerMs: 0,
    timerRunning: false,
    timerStartedAt: null,
    state: "draft"
  };

  let dayIndex = 0;
  let activeSpotIndex = 0;
  let editingJobIndex = null;
  let bottomMode = "timeline";
  let timerInterval = null;
  let timerStartTime = null;
  let timerElapsedMs = 0;
  let isRunning = false;
  let liveJobRef = null;

  const GAP_MINS = 15;
  const DEFAULT_DAY_START = 8 * 60;   // 08:00
  let masterTools = [];
  let masterInventory = [];
  const STORAGE_KEY = "dayspecs_days_v1";
  const META_KEY = "dayspecs_meta_v1";

  function serializeDays(daysArr) {
    return daysArr.map(d => ({
      ...d,
      date: (d.date instanceof Date) ? d.date.toISOString() : new Date(d.date).toISOString()
    }));
  }

  function reviveDays(rawDays) {
    return (rawDays || []).map(d => ({
      ...d,
      date: new Date(d.date),
    }));
  }

  function saveAll() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeDays(days)));
      // keep meta separate so you can evolve days format later
      const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      if (!meta.installDate) meta.installDate = new Date().toISOString();
      meta.masterTools = masterTools;
      meta.masterInventory = masterInventory;
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      console.warn("SAVE FAILED", e);
    }
  }

  function loadAll() {

    try {

      // ALWAYS ensure meta exists first
      const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");

      if (!meta.installDate) {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        meta.installDate = t.toISOString();
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      }

      masterTools = meta.masterTools || [];
      masterInventory = meta.masterInventory || [];

      draftJob.travelRate = meta.defaultTravelRate ?? draftJob.travelRate ?? "";
      draftJob.durationRate = meta.defaultDurationRate ?? draftJob.durationRate ?? "";
      meta.taxRate ??= 20;

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;

      days = reviveDays(parsed);
      sortDaysChronologically();

      return true;

    } catch (e) {
      console.warn("LOAD FAILED", e);
      return false;
    }

  }

  function sortDaysChronologically() {
    days.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  const titleInput = document.getElementById("job-title");
  titleInput?.addEventListener("input", () => {
    draftJob.title = titleInput.value;
  });

  const durationValueBox = document.getElementById("val-duration");
  const durationCalcBox = document.getElementById("calc-duration");
  const travelMilesInput = document.querySelector(".travel-miles");
  const travelValueBox = document.getElementById("val-travel");
  const travelRateInput = document.querySelector(".travel-rate");
  const travelTotalBox = document.getElementById("calc-travel");
  const durationMinsInput = document.querySelector(".duration-mins");
  const durationHoursInput = document.querySelector(".duration-hours");
  const durationRateInput = document.querySelector(".duration-rate");
  const peopleValueBox = document.getElementById("val-people");
  const peopleList = document.querySelector(".people-list");
  const toolsList = document.querySelector(".tools-list");
  const toolsValueBox = document.getElementById("val-tools");
  const invList = document.querySelector(".inventory-list");
  const invTotalBox = document.getElementById("calc-inventory");
  const invValueBox = document.getElementById("val-inventory");
  const invoiceBlock = document.getElementById("invoice-block");
  const invoiceCopyBtn = document.getElementById("btn-invoice-copy");
  const invoiceShareBtn = document.getElementById("btn-invoice-share");
  const invoicePaperWrapper = document.querySelector(".invoice-paper-wrapper");
  const totalBox = document.getElementById("calc-total")
  const notesBox = document.querySelector(".notes-box");
  const notesValueBox = document.getElementById("val-notes");

  const botRange = document.getElementById("bot-range");
  const botStart = document.getElementById("bot-start");
  const botTimer = document.getElementById("bot-timer");
  const botComplete = document.getElementById("bot-complete");
  const botBack = document.getElementById("bot-back");

  const invoicePaper = document.getElementById("invoice-paper");
  const invoiceBackBtn = document.getElementById("btn-invoice-back");

  travelRateInput?.addEventListener("input", () => {

    let v = travelRateInput.value.replace(/\D/g,"");
    if (v.length > 3) v = v.slice(0,3);
    if (Number(v) > 999) v = "999";
    travelRateInput.value = v;
    draftJob.travelRate = v;

    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    meta.defaultTravelRate = draftJob.travelRate;
    localStorage.setItem(META_KEY, JSON.stringify(meta));

    refreshTravelUI();
    refreshTotalUI();

  });

  durationRateInput?.addEventListener("input", () => {

    let v = durationRateInput.value.replace(/\D/g,"");
    if (v.length > 3) v = v.slice(0,3);
    if (Number(v) > 999) v = "999";
    durationRateInput.value = v;
    draftJob.durationRate = v;

    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    meta.defaultDurationRate = draftJob.durationRate;
    localStorage.setItem(META_KEY, JSON.stringify(meta));

    refreshDurationUI();
    refreshTotalUI();

  });

  document.querySelector(".inv-company")?.addEventListener("input", () => {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    meta.companyName =
      document.querySelector(".inv-company").textContent.trim();
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  });

  // Tap the preview to expand to full editable invoice
  invoicePaper?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!invoiceBlock) return;
    invoiceBlock.classList.add("full");
  });

  // Back: if full -> collapse to preview, else close overlay
  invoiceBackBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!invoiceBlock) return;

  if (invoiceBlock.classList.contains("full")) {

    const wrapper = document.querySelector(".invoice-paper-wrapper");
    if (wrapper) wrapper.scrollTop = 0;

    invoiceBlock.classList.remove("full");
    invoiceBlock.classList.add("preview");

    openInvoice(invoiceJobRef);
    return;

  }

    closeInvoicePreview();
  });

  function generateInvoiceNumber() {

    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");

    if (!meta.nextInvoiceNumber) {
      meta.nextInvoiceNumber = 1000;   // starting number
    }

    const num = meta.nextInvoiceNumber++;

    localStorage.setItem(META_KEY, JSON.stringify(meta));

    return "PFN-0" + num;
  }

  botStart.onclick = () => {

    // global: don’t allow starting a new job if ANY job is live
    const anyLive = days.some(day =>
      day.timelineList.some(it => it.type === "job" && it.job && it.job.isLive)
    );

    // if you’re not inside a saved job editor, you can’t start
    if (editingJobIndex === null) return;

    // if some OTHER job is live, block
    const thisJob = days[dayIndex].timelineList[editingJobIndex]?.job;
    if (anyLive && (!thisJob || !thisJob.isLive)) return;

    // START / RESUME
    if (!isRunning) {

      clearInterval(timerInterval);
      timerInterval = null;

      liveJobRef = thisJob;
      if (!liveJobRef) return;

      // mark running
      liveJobRef.isLive = true;
      liveJobRef.state = "running";

      enforceJobOrdering();
      recalcSpotsFrom(0);
      renderTimeline();

      jobBlock.classList.add("hidden");
      bottomMode = "timeline";
      updateBottomBarMode();
      editingJobIndex = null;

      // start the clock from saved-job values only
      timerStartTime = Date.now();
      isRunning = true;
      updateLiveUIState();

      const startBaseMs = Number(liveJobRef.accumulatedMs || 0);

      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        if (!liveJobRef) return;

        const now = Date.now();
        timerElapsedMs = startBaseMs + (now - timerStartTime);
        liveJobRef.accumulatedMs = timerElapsedMs;

        // keep saved job updated continuously
        liveJobRef.accumulatedMs = timerElapsedMs;

        // keep draft in sync ONLY if you’re editing this job
        if (editingJobIndex !== null) {
          const current = days[dayIndex].timelineList[editingJobIndex]?.job;
          if (current === liveJobRef) draftJob.accumulatedMs = timerElapsedMs;
        }

        updateTimerDisplay();
      }, 250);

      botStart.textContent = "Pause";
      return;
    }

    // PAUSE
    clearInterval(timerInterval);
    timerInterval = null;
    timerStartTime = null;

    isRunning = false;

    // freeze elapsed into timerElapsedMs already, and push it into the live job (wherever it is)
    let pausedAny = false;

    for (const day of days) {
      for (const item of day.timelineList) {
        if (item.type === "job" && item.job && item.job.isLive) {
          item.job.accumulatedMs = timerElapsedMs;
          item.job.isLive = false;
          item.job.state = "paused";
          pausedAny = true;
        }
      }
    }

    // keep draft in sync if we’re editing something
    draftJob.accumulatedMs = timerElapsedMs;
    draftJob.state = "paused";

    // if you still want the editor to close when pausing:
    if (editingJobIndex !== null) {
      renderTimeline();
      jobBlock.classList.add("hidden");
      bottomMode = "timeline";
      updateBottomBarMode();
    }
    updateLiveUIState();
    renderTimeline();
    botStart.textContent = "Resume";
  };

  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmMsg = document.getElementById("confirmMsg");
  const confirmYes = document.getElementById("confirmYes");
  const confirmNo = document.getElementById("confirmNo");

  function confirmUI(message, onYes) {
    if (!confirmOverlay) return; // fail safe
    confirmMsg.textContent = message;

    const close = () => confirmOverlay.classList.add("hidden");

    confirmYes.onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); onYes(); };
    confirmNo.onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); };

    // click outside card = No
    confirmOverlay.onclick = (e) => { if (e.target === confirmOverlay) close(); };

    confirmOverlay.classList.remove("hidden");
  }

  function updateCreateUpdateLabel() {
    if (editingJobIndex === null) {
      acceptBtn.textContent = "Create";
    } else {
      acceptBtn.textContent = "Update";
    }
  }

  function enforceJobOrdering() {
    const list = days[dayIndex].timelineList;

    // Split only JOB items; spots stay where they are for now (we will recalc after)
    const jobs = [];
    const spots = [];

    for (const it of list) {
      if (it.type === "job") jobs.push(it);
      else spots.push(it);
    }

    const rank = (job) => {
      const s = job.state || "";
      const live = !!job.isLive;
      const acc = Number(job.accumulatedMs) || 0;

      if (s === "complete" || job.status === "complete") return 0;          // complete first (earliest bucket)
      if (live) return 1;                                                    // currently running
      if (s === "paused" || acc > 0) return 2;                               // started/paused
      return 3;                                                              // not started
    };

    jobs.sort((a, b) => rank(a.job) - rank(b.job));

    // Write sorted jobs back into the original timelineList job slots
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].type === "job") {
        list[i] = jobs[j++];
      }
    }
  }

  function syncToday() {

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    sortDaysChronologically();
    const firstStored = new Date(days[0].date);
    firstStored.setHours(0, 0, 0, 0);

    let diffDays = Math.floor((today - firstStored) / 86400000);

    if (diffDays <= 0) return;

    for (let i = 1; i <= diffDays; i++) {

      const d = new Date(firstStored);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);

      const exists = days.some(day => {
        const x = new Date(day.date);
        x.setHours(0, 0, 0, 0);
        return x.getTime() === d.getTime();
      });

      if (!exists) {
        days.push(makeDay(d));
      }
    }

    sortDaysChronologically();

    dayIndex = 0;
    saveAll();
  }

  function updateLiveUIState() {

    const jobExists = (editingJobIndex !== null);
    const current = days[dayIndex].timelineList[editingJobIndex]?.job;

    const anyLive = days.some(day =>
      day.timelineList.some(it =>
        it.type === "job" && it.job && it.job.isLive
      )
    );

    let disableStart = !jobExists;
    let disableComplete = !jobExists;

    if (anyLive && jobExists) {
      if (!current?.isLive) {
        disableStart = true;
        disableComplete = true;
      }
    }

    if (jobExists) {
      if (current?.state === "running") {
        disableComplete = true;
      }
    }

    botStart.disabled = disableStart;
    botComplete.disabled = disableComplete;
    deleteBtn.disabled = !jobExists || current?.state === "running";
  }

  botComplete.onclick = () => {

    if (!draftJob) return;

    if (!draftJob.invoiceNumber) {
      draftJob.invoiceNumber = generateInvoiceNumber();
    }

    // Stop timer cleanly
    pauseTimerIntoDraft();

    const totalMs = draftJob.accumulatedMs || 0;
    const totalMinsRaw = totalMs / 60000;
    const roundedMins = Math.ceil(totalMinsRaw / 5) * 5;

    const quotedMins = Number(draftJob.durationMins) || 0;

    const finalActualMins =
      (roundedMins > quotedMins) ? roundedMins : null;

    draftJob.actualDurationMins = finalActualMins;

    // If editing an existing job
    if (editingJobIndex !== null) {

      const jobRef = days[dayIndex].timelineList[editingJobIndex].job;

      // Copy full draft back into saved job
      days[dayIndex].timelineList[editingJobIndex].job =
        JSON.parse(JSON.stringify(draftJob));

      // Now mark complete + override duration
      const saved = days[dayIndex].timelineList[editingJobIndex].job;

      saved.status = "complete";
      saved.state = "complete";
      draftJob.state = "complete";

      saved.actualDurationMins = finalActualMins;

      saved.accumulatedMs = draftJob.accumulatedMs || 0;

      saved.total = calcSavedTotal(saved);
      saved.isLive = false;

      // --- MOVE PAIR LIKE START DOES ---
      const list = days[dayIndex].timelineList;

      const jobIndex = editingJobIndex;
      let spotIndex = jobIndex - 1;
      if (list[spotIndex]?.type !== "spot") {
        spotIndex = jobIndex + 1;
      }

      // remove spot + job
      const pair = list.splice(spotIndex, 2);

      // find last complete AFTER removal
      const lastCompleteIndex = list.findLastIndex(
        it => it.type === "job" && it.job.state === "complete"
      );

      // insert after completes
      const insertIndex = lastCompleteIndex + 1;
      list.splice(insertIndex, 0, pair[0], pair[1]);

      // reset editing
      editingJobIndex = null;

      // recalc + render
      recalcSpotsFrom(0);

      // DELETE only when editing an existing saved job
      if (deleteBtn) deleteBtn.disabled = (editingJobIndex === null);
      renderTimeline();

      jobBlock.classList.add("hidden");
      bottomMode = "timeline";
      updateBottomBarMode();

      saveAll();
      return;
    }

  };

  botRange.onclick = openTimeModal;
  botBack.onclick = closePanels;



  function pauseTimerIntoDraft() {
    if (!isRunning || !liveJobRef) return;

    const now = Date.now();
    const runningMs = now - (timerStartTime || now);

    liveJobRef.accumulatedMs =
      (liveJobRef.accumulatedMs || 0) + runningMs;

    liveJobRef.isLive = false;
    liveJobRef.state = "paused";

    draftJob.accumulatedMs = liveJobRef.accumulatedMs;

    clearInterval(timerInterval);
    timerInterval = null;
    timerStartTime = null;
    isRunning = false;

    updateLiveUIState();
    updateTimerDisplay();
    botStart.textContent = "Resume";
  }

  function isOverlayOpen() {
    return document.querySelector(".overlay:not(.hidden)") !== null;
  }

  function makeDay(dateObj) {
    return {
      date: dateObj,
      dayStartMins: DEFAULT_DAY_START,
      timelineList: [
        { type: "spot", timeMins: DEFAULT_DAY_START }
      ]
    };
  }

  let days = [
    makeDay(new Date()),
    makeDay(new Date(Date.now() + 86400000)),
    makeDay(new Date(Date.now() + 86400000 * 2))
  ];

  function findTodayIndex() {

    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = 0; i < days.length; i++) {

      const d = new Date(days[i].date);
      d.setHours(0,0,0,0);

      if (d.getTime() === today.getTime()) {
        return i;
      }
    }

    return 0;
  }

  loadAll(); // if storage exists, this overwrites days

  function getLastSpotMins() {
    const list = days[dayIndex].timelineList || [];

    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === "spot") return list[i].timeMins;
    }

    return days[dayIndex].dayStartMins;
  }

  function minsToHHMM(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function safeNum(v) {
    const n = parseFloat((v || "").toString().trim());
    return isNaN(n) ? 0 : n;
  }

  function refreshTotalUI() {
    if (!totalBox) return;
    totalBox.textContent = money(calcAutoTotal());
  }

  function money(n) {
    return `£${n.toFixed(2)}`;
  }

  function refreshTimelineLabels() {
    const d = days[dayIndex];

    const botEl = document.getElementById("time-bottom");

    if (botEl) botEl.textContent = minsToHHMM(d.dayStartMins);
  }

  function retimeDayToNewStartEnd(newStartMins, newEndMins) {

    const d = days[dayIndex];

    const oldStart = d.dayStartMins;

    const lastSpot = getLastSpotMins();
    const currentSpan = lastSpot - d.dayStartMins;

    const maxStart = (24 * 60) - currentSpan;

    if (newStartMins > maxStart) {
      newStartMins = maxStart;
    }

    // how much the start moved by
    const shift = newStartMins - oldStart;

    // update day range
    d.dayStartMins = newStartMins;
    d.dayEndMins = newEndMins;

    // shift every timeline item by the same amount
    for (let item of d.timelineList) {
      if (item.type === "spot") {
        item.timeMins += shift;
      }
    }

    enforceJobOrdering();
    recalcSpotsFrom(0);
    renderTimeline();
    saveAll();
  }

  const dayStartInput = document.getElementById("day-start");

  dayStartInput?.addEventListener("change", () => {

    const v = dayStartInput.value;   // "HH:MM"

    if (!v) return;

    const [h, m] = v.split(":").map(Number);

    const mins = (h * 60) + m;

    setDayStartMins(mins);   // call your existing logic

  });

function recalcSpotsFrom(startIndex) {

  const timelineList = days[dayIndex].timelineList;

  timelineList[0].timeMins = days[dayIndex].dayStartMins;

  while (startIndex > 0 && timelineList[startIndex]?.type !== "spot") {
    startIndex--;
  }

  if (!timelineList[startIndex] || timelineList[startIndex].type !== "spot") {
    console.warn("recalcSpotsFrom: no spot found at/behind index", startIndex);
    return;
  }

  let t = (startIndex === 0)
    ? days[dayIndex].dayStartMins
    : timelineList[startIndex].timeMins;

  let first = true;

  for (let i = startIndex + 1; i < timelineList.length; i++) {
    const it = timelineList[i];

    if (it.type === "spot") {
      it.timeMins = t;
    }

    if (it.type === "job") {
      if (!first) t += GAP_MINS;
      else t += GAP_MINS;   // first job still needs the 15-min gap

      t += safeNum(it.job.durationMins);
      first = false;
    }
  }
}

  function selectDate(targetDate) {

    // normalise to midnight
    const selected = new Date(targetDate);
    selected.setHours(0, 0, 0, 0);

    // enforce install date boundary
    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    const install = new Date(meta.installDate);
    install.setHours(0, 0, 0, 0);

    if (selected < install) return;

    // check if day already exists
    let index = days.findIndex(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0, 0, 0, 0);
      return dDate.getTime() === selected.getTime();
    });

    // if not found, create just that one day
    if (index === -1) {
      days.push(makeDay(selected));

      // sort by date ascending
      days.sort((a, b) => new Date(a.date) - new Date(b.date));

      // find it again after sort
      index = days.findIndex(d => {
        const dDate = new Date(d.date);
        dDate.setHours(0, 0, 0, 0);
        return dDate.getTime() === selected.getTime();
      });
    }

    dayIndex = index;
    loadDay(dayIndex);
    saveAll();
  }

  function refreshDraftUI() {

    // TRAVEL badge
    if (travelValueBox) {
      travelValueBox.textContent =
        draftJob.travelMiles ? `${draftJob.travelMiles} mi` : "–";
    }

    // DURATION badge
    if (durationValueBox) {
      durationValueBox.textContent =
        draftJob.durationMins ? `${draftJob.durationMins} min` : "–";
    }

    // PEOPLE badge
    const peopleCount = (draftJob.people || []).length;
    if (peopleValueBox) {
      peopleValueBox.textContent = peopleCount ? `x${peopleCount}` : "–";
    }

    // TOOLS badge
    const toolCount = (draftJob.tools || []).filter(t => t.checked).length;
    if (toolsValueBox) {
      toolsValueBox.textContent = toolCount ? `x${toolCount}` : "–";
    }

    // INVENTORY badge
    const usedInv = (draftJob.inventory || []).filter(it => safeNum(it.qty) > 0).length;
    if (invValueBox) {
      invValueBox.textContent = usedInv ? `x${usedInv}` : "–";
    }

    // NOTES badge
    if (notesValueBox) {
      notesValueBox.textContent = (draftJob.notes || "").trim() ? "✓" : "–";
    }
  }

  let editorMode = "draft"; // "draft" | "invoice"
  let invoiceJobRef = null; // points at the saved job object when in invoice mode

  function closeInvoicePreview() {
    if (invoiceBlock) invoiceBlock.classList.add("hidden");
    invoiceJobRef = null;
    bottomMode = "timeline";
    updateBottomBarMode();
  }

  function openInvoice(savedJob) {

    invoiceJobRef = savedJob;
    const wrapper = document.querySelector(".invoice-paper-wrapper");
    const paper = document.getElementById("invoice-paper");

    // Show invoice
    invoiceBlock.classList.remove("hidden");
    invoiceBlock.classList.remove("full");
    invoiceBlock.classList.add("preview");

    // force preview card layout back
    const card = document.querySelector(".invoice-card");
    if (card) card.style.width = "";

    if (paper){
      paper.style.transform = "none";
      paper.style.width = "100%";
      paper.style.maxWidth = "100%";
    }

    // Header
    const numberEl = paper.querySelector(".inv-number");
    const dateEl = paper.querySelector(".inv-date");

    const today = new Date().toLocaleDateString();

    if (numberEl) numberEl.textContent = `Invoice: ${savedJob.invoiceNumber || ""}`;
    if (dateEl) dateEl.textContent = `Date: ${today}`;

    const meta = JSON.parse(localStorage.getItem(META_KEY) || {});
    const companyEl = paper.querySelector(".inv-company");

    if (companyEl && meta.companyName) {
      companyEl.textContent = meta.companyName;
    }

    // Customer
    const custEl = paper.querySelector(".inv-customer");
    if (custEl) custEl.textContent = savedJob.title || "";

    // Notes
    const notesEl = paper.querySelector(".inv-notes");
    if (notesEl) notesEl.textContent = savedJob.notes || "";

    // Rows
    const travelRow = paper.querySelector(".row.travel");
    const labourRow = paper.querySelector(".row.labour");
    const materialRow = paper.querySelector(".row.materials");
    const totalRow = paper.querySelector(".row.total");
    const vatInput = paper.querySelector("#vat-rate");
    const vatValue = paper.querySelector(".vat-value");

    // -------- COST CALCULATIONS --------

    // Travel
    const travelCost =
      (Number(savedJob.travelMiles) || 0) *
      (Number(savedJob.travelRate) || 0);

    // Labour minutes
    const actual = Number(savedJob.actualDurationMins) || 0;
    const mins = actual >= 2 ? actual : (Number(savedJob.durationMins) || 0);

    // Labour rate
    const rateRaw = savedJob.durationRate;
    const rate = (typeof rateRaw === "string")
      ? parseFloat(rateRaw.replace(/[^\d.]/g, "")) || 0
      : (Number(rateRaw) || 0);

    const labourCost = (mins / 60) * rate;

    // Materials
    const materialCost = (savedJob.inventory || []).reduce((sum, it) => {
      return sum + (Number(it.qty) || 0) * (Number(it.priceEach) || 0);
    }, 0);

    const materialsBox = paper.querySelector(".inv-material-lines");

    if (materialsBox) {

      materialsBox.innerHTML = "";

      (savedJob.inventory || []).forEach(it => {

        if (!it.name && !it.qty) return;

        const row = document.createElement("div");
        row.className = "inv-mat-row";

        const qty = Number(it.qty) || 0;
        const price = Number(it.priceEach) || 0;
        const total = qty * price;

        row.innerHTML = `
          <div class="inv-mat-name">${it.name}</div>
          <div class="inv-mat-calc">${qty} × £${price.toFixed(2)} = £${total.toFixed(2)}</div>
        `;

        materialsBox.appendChild(row);

      });

    }

    // Subtotal
    const subTotal = travelCost + labourCost + materialCost;

    // Tax
    const taxRate = Number(meta.taxRate ?? 20);

    if (vatInput) vatInput.value = taxRate;

    const tax = subTotal * (taxRate / 100);

    // Final total
    const total = subTotal + tax;

    // -------- RENDER ROWS --------

    if (travelRow) {
      travelRow.innerHTML =
        `<span>Travel</span><span>£${travelCost.toFixed(2)}</span>`;
    }

    if (labourRow) {
      labourRow.innerHTML =
        `<span>Labour</span><span>£${labourCost.toFixed(2)}</span>`;
    }

    if (materialRow) {
      materialRow.innerHTML =
        `<span>Materials</span><span>£${materialCost.toFixed(2)}</span>`;
    }

    if (vatValue) {
      vatValue.textContent = `£${tax.toFixed(2)}`;
    }

    if (totalRow) {
      totalRow.innerHTML =
        `<span>Total</span><span>£${total.toFixed(2)}</span>`;
    }

    if (vatInput) {
      vatInput.oninput = () => {

        const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
        meta.taxRate = Number(vatInput.value) || 0;
        localStorage.setItem(META_KEY, JSON.stringify(meta));

        const newRate = Number(vatInput.value) || 0;

        const travelCost =
          (Number(savedJob.travelMiles) || 0) *
          (Number(savedJob.travelRate) || 0);

        const actual = Number(savedJob.actualDurationMins) || 0;
        const mins = actual >= 2 ? actual : (Number(savedJob.durationMins) || 0);

        const rateRaw = savedJob.durationRate;
        const rate = (typeof rateRaw === "string")
          ? parseFloat(rateRaw.replace(/[^\d.]/g, "")) || 0
          : (Number(rateRaw) || 0);

        const labourCost = (mins / 60) * rate;

        const materialCost = (savedJob.inventory || []).reduce((sum, it) => {
          return sum + (Number(it.qty) || 0) * (Number(it.priceEach) || 0);
        }, 0);

        const subTotal = travelCost + labourCost + materialCost;

        const newTax = subTotal * (newRate / 100);
        const newTotal = subTotal + newTax;

        if (vatValue) {
          vatValue.textContent = `£${newTax.toFixed(2)}`;
        }

        if (totalRow) {
          totalRow.innerHTML =
            `<span>Total</span><span>£${newTotal.toFixed(2)}</span>`;
        }

      };
    }

    requestAnimationFrame(() => {

      paper.style.transform = "none";
      paper.style.transformOrigin = "top left";

      const wrapperW = wrapper.clientWidth;
      const wrapperH = wrapper.clientHeight;

      const paperW = paper.scrollWidth;
      const paperH = paper.scrollHeight;

      const scale = Math.min(wrapperW / paperW, wrapperH / paperH);

      paper.style.transform = `scale(${scale})`;

    });

    bottomMode = "invoicePreview";
    updateBottomBarMode();
  }

  invoicePaperWrapper?.addEventListener("click", () => {

    if (!invoiceBlock.classList.contains("preview")) return;

    invoiceBlock.classList.remove("preview");
    invoiceBlock.classList.add("full");

  });

  invoiceCopyBtn?.addEventListener("click", async (e) => {

    e.stopPropagation();
    e.preventDefault();

    const text = invoicePaper?.innerText.replace("⧉","").trim() || "";
    const original = invoiceCopyBtn.textContent;

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {

      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);

      temp.select();
      document.execCommand("copy");

      document.body.removeChild(temp);
    }

    // visual feedback
    invoiceCopyBtn.textContent = "✓";

    setTimeout(() => {
      invoiceCopyBtn.textContent = original;
    }, 900);

  });

  invoiceShareBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!invoiceJobRef) return;

    await shareInvoice(invoiceJobRef);
  });

  function buildInvoiceText(job) {
    const title = (job.title || "(no title)").trim();
    const date = job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "";

    const travelCost =
      (Number(job.travelMiles) || 0) * (Number(job.travelRate) || 0);

    const labourCost =
      (Number(job.actualMins ?? job.durationMins) || 0) / 60 * (Number(job.durationRate) || 0);

    const invCost = (job.inventory || []).reduce((sum, it) => {
      const qty = Number(it.qty) || 0;
      const each = Number(it.priceEach) || 0;
      return sum + qty * each;
    }, 0);

    const total = travelCost + labourCost + invCost;

    const lines = [
      `${title}`,
      date ? `Date: ${date}` : "",
      "",
      `Travel: £${travelCost.toFixed(2)}`,
      `Labour: £${labourCost.toFixed(2)}`,
      `Materials: £${invCost.toFixed(2)}`,
      `----------------------`,
      `TOTAL: £${total.toFixed(2)}`,
      "",
      `Notes:`,
      (job.notes || "").trim() || "–"
    ].filter(l => l !== "");

    return lines.join("\n");
  }

  async function shareInvoice(job) {
    const text = buildInvoiceText(job);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Invoice",
          text: text
        });
        return; // IMPORTANT: stops fallback
      } catch (e) {
        return; // ALSO stop fallback on cancel
      }
    }
  }

  function updateBottomBarMode() {

    // hide everything
    botRange.classList.add("hidden");
    botStart.classList.add("hidden");
    botTimer.classList.add("hidden");
    botComplete.classList.add("hidden");
    botBack.classList.add("hidden");
    if (bottomMode === "invoice") {
      return;
    }

    if (bottomMode === "timeline") {
      const d = days[dayIndex];
      const endMins = getLastSpotMins();
      botRange.textContent = `Start ${minsToHHMM(d.dayStartMins)} – End ${minsToHHMM(endMins)}`;
      botRange.classList.remove("hidden");
    }

    if (bottomMode === "draft") {
      botStart.classList.remove("hidden");
      botTimer.classList.remove("hidden");
      botComplete.classList.remove("hidden");
    }

    if (bottomMode === "panel") {
      botBack.classList.remove("hidden");
    }
  }

  function updateTimerDisplay() {
    if (!botTimer) return;

    if (editingJobIndex === null) {
      botTimer.textContent = "00:00:00";
      return;
    }

    const job = days[dayIndex].timelineList[editingJobIndex]?.job;
    if (!job) {
      botTimer.textContent = "00:00:00";
      return;
    }

    const ms = Number(job.accumulatedMs || 0);
    const totalSeconds = Math.floor(ms / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    botTimer.textContent =
      `${String(hours).padStart(2, "0")}:` +
      `${String(mins).padStart(2, "0")}:` +
      `${String(secs).padStart(2, "0")}`;
  }

  /* ===============================
     DATE
  ================================ */

  // ===== HEADER / CALENDAR BUTTON =====
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnCalendar = document.getElementById("btn-calendar"); // this IS the centre now

  function setHeaderText() {
    if (!btnCalendar) return;

    const d = new Date(days[dayIndex].date);
    d.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nice = d.toDateString();
    btnCalendar.innerHTML = (d.getTime() === today.getTime())
      ? `Today<br>${nice}`
      : nice;
  }

  btnCalendar?.addEventListener("click", () => {
    if (isOverlayOpen()) return;
    if (bottomMode !== "timeline") return;
    openCalendar();
  });

  function openCalendar() {

    const current = new Date(days[dayIndex].date);
    current.setHours(0, 0, 0, 0);

    const picked = prompt("Enter date (YYYY-MM-DD):",
      current.toISOString().slice(0, 10));

    if (!picked) return;

    const chosen = new Date(picked);
    if (isNaN(chosen)) return;

    selectDate(chosen);
  }

  function loadDay(i) {
    dayIndex = i;

    const d = days[dayIndex];
    if (typeof d.dayStartMins !== "number") d.dayStartMins = 8 * 60;

    timelineList = d.timelineList;
    if (!timelineList[0]) {
      timelineList[0] = { type: "spot", timeMins: d.dayStartMins };
    }

    nextSlotMins = timelineList[0]?.timeMins ?? d.dayStartMins;

    const liveExists = days.some(day =>
      day.timelineList.some(it => it.type === "job" && it.job?.isLive)
    );

    if (liveExists) {
      bottomMode = "timeline";
      updateBottomBarMode();
    }

    renderTimeline();

    draftJob.inventory = masterInventory.map(it => ({
      name: it.name,
      priceEach: it.priceEach,
      qty: 0
    }));

    draftJob.tools = masterTools.map(t => ({
      ...t,
      checked: !!t.core
    }));

    renderInventoryFromDraft();
    renderToolsFromDraft();
    refreshTimelineLabels();
    setHeaderText();
    refreshDraftUI();
  }

  function ensureNextDayExists() {
    const last = days[days.length - 1];
    const nextDate = new Date(last.date);
    nextDate.setDate(nextDate.getDate() + 1);
    days.push(makeDay(nextDate));
  }

  function ensurePrevDayExists() {
    const first = days[0];
    const prevDate = new Date(first.date);
    prevDate.setDate(prevDate.getDate() - 1);
    days.unshift(makeDay(prevDate));

    // because we inserted at the front, the current day shifts right by 1
    dayIndex += 1;
  }

  btnPrev.onclick = () => {
    if (isOverlayOpen() || bottomMode !== "timeline") return;

    const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");
    const install = new Date(meta.installDate);
    install.setHours(0, 0, 0, 0);

    const currentDate = new Date(days[dayIndex].date);
    currentDate.setHours(0, 0, 0, 0);

    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);

    if (prevDate < install) return;

    if (dayIndex <= 0) {
      ensurePrevDayExists();
    }

    loadDay(dayIndex - 1);
  };

  btnNext.onclick = () => {
    if (isOverlayOpen() || bottomMode !== "timeline") return;

    if (dayIndex >= days.length - 1) {
      ensureNextDayExists();
    }

    loadDay(dayIndex + 1);
  };

  setHeaderText();

  syncToday();
  loadDay(0);

  // ===============================
  // TIME MODAL (Start / End picker)
  // ===============================

  const timeModal = document.getElementById("time-block");

  const timeOk = document.getElementById("btn-time-set");
  const timeCancel = document.getElementById("btn-time-cancel");

  const timeTitle = document.querySelector("#time-block .time-title");

  timeCancel?.addEventListener("click", closeTimeModal);

  timeOk?.addEventListener("click", () => {

    const timeInput = document.getElementById("start-time");

    let v = timeInput?.value;

    if (!v) {

      const d = days[dayIndex];

      const hh = Math.floor(d.dayStartMins / 60);
      const mm = d.dayStartMins % 60;

      v = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
    }

    const [hh, mm] = v.split(":").map(Number);

    const pickedStart = (hh * 60) + mm;

    const d = days[dayIndex];

    // shift whole day by difference
    const end = getLastSpotMins();
    retimeDayToNewStartEnd(pickedStart, end);

    closeTimeModal();
    refreshTimelineLabels();
    updateBottomBarMode();
  });

  function openTimeModal() {

    if (!timeModal) return;

    const d = days[dayIndex];

    const hh = Math.floor(d.dayStartMins / 60);
    const mm = d.dayStartMins % 60;

    const timeInput = document.getElementById("start-time");
    if (timeInput) {
      timeInput.value = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
    }

    if (timeTitle) timeTitle.textContent = "Set day time";

    timeModal.classList.remove("hidden");
  }

  function closeTimeModal() {
    if (!timeModal) return;
    timeModal.classList.add("hidden");
  }

  /* ===============================
     SPOT / JOB BLOCK
  ================================ */

  const jobBlock = document.querySelector(".job-block");
  const cancelBtn = document.getElementById("btn-cancel");
  const acceptBtn = document.getElementById("btn-accept");
  const deleteBtn = document.getElementById("btn-delete");

  function renderTimeline() {
    const d = days[dayIndex];
    if (!d) return;

    // keep timelineList in sync for any other code that uses it
    timelineList = d.timelineList;

    const stack = document.getElementById("timeline-stack");
    if (!stack) return;

    stack.innerHTML = "";
    let cursorMins = d.dayStartMins;

    for (let i = 0; i < d.timelineList.length; i++) {
      const item = d.timelineList[i];

      if (item.type === "spot") {
        const row = document.createElement("div");
        row.className = "spot-row";

        const time = document.createElement("div");
        time.className = "spot-time-left";
        time.textContent = minsToHHMM(item.timeMins);

        const btn = document.createElement("button");
        btn.className = "btn-spot";
        btn.textContent = "+";

        btn.onclick = () => {

          // block if not on main timeline
          if (bottomMode !== "timeline") return;

          // block past days
          if (dayIndex < todayIndex) return;

          const list = days[dayIndex].timelineList;
          const lastSpot = [...list].reverse().find(it => it.type === "spot");

          if (lastSpot && lastSpot.timeMins >= 1440) return;

          openEditorForSpot(i);
        };

        row.appendChild(time);
        row.appendChild(btn);
        stack.appendChild(row);
        continue;
      }

      if (item.type === "job") {
        const saved = item.job || {};
        let stateDot = "";

        if (saved.state === "complete") {
          stateDot = "🔴";
        }
        else if (saved.state === "running") {
          stateDot = "🟢";
        }
        else if (saved.state === "paused") {
          stateDot = "⚪";
        }

        const card = document.createElement("div");
        card.className = "saved-job";

        const milesTxt = Number(saved.travelMiles) > 0
          ? Math.round(Number(saved.travelMiles)) + " mi"
          : "– mi";

        const pplTxt = (saved.people || []).length > 0
          ? (saved.people || []).length + " ppl"
          : "– ppl";

        const costTxt = Number(saved.total) > 0
          ? "£" + Number(saved.total).toFixed(0)
          : "£ –";

        card.innerHTML = `
          <div class="jobcard-top">
            ${saved.title || "(no title)"}
          </div>
          <div class="jobcard-meta">
            <span>${milesTxt}</span>
            <span class="meta-sep">•</span>
            <span>${pplTxt}</span>
            <span class="meta-sep">•</span>
            <span>${costTxt}</span>
            <span class="job-state-dot">${stateDot}</span>
          </div>
        `;

        card.onclick = () => {
          if (bottomMode !== "timeline") return;

          const savedJob = item.job;

          if (savedJob && savedJob.status === "complete") {
            openInvoice(savedJob);
            return;
          }

          editingJobIndex = i;
          updateCreateUpdateLabel();

          invoiceJobRef = null;

          // deep copy saved job into draft
          draftJob = JSON.parse(JSON.stringify(savedJob || {}));

          if (durationRateInput) durationRateInput.value = draftJob.durationRate || "";
          if (travelRateInput) travelRateInput.value = draftJob.travelRate || "";

          // --- TIMER: restore saved state for this job ---

          const job = days[dayIndex].timelineList[editingJobIndex].job;

          if (job.state === "running" && job.timerStartedAt) {
            timerElapsedMs =
              job.accumulatedMs + (Date.now() - job.timerStartedAt);
          } else {
            timerElapsedMs = Number(job.accumulatedMs || 0);
          }
          updateTimerDisplay();
          if (savedJob && savedJob.isLive) {
            isRunning = true;
            botStart.textContent = "Pause";
          } else {
            isRunning = false;
            botStart.textContent = (timerElapsedMs > 0) ? "Resume" : "Start";
          }

          // --- title/notes inputs ---
          if (titleInput) titleInput.value = draftJob.title || "";
          if (notesBox) notesBox.value = draftJob.notes || "";
          if (travelRateInput) travelRateInput.value = draftJob.travelRate || "";
          if (durationRateInput) durationRateInput.value = draftJob.durationRate || "";

          // --- rebuild panels from draft ---
          renderPeopleList();
          renderInventoryFromDraft();
          renderToolsFromDraft();
          updateLiveUIState();

          // --- refresh calculated UI ---
          refreshDraftUI();
          refreshTotalUI();

          jobBlock.classList.remove("hidden");
          bottomMode = "draft";
          updateBottomBarMode();
        };

        stack.appendChild(card);
        continue;
      }
    }

    refreshTimelineLabels();
    if (bottomMode === "timeline") updateBottomBarMode();

    // With column-reverse, scrollTop=0 shows the “bottom”
    stack.scrollTop = 0;
  }

  deleteBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (editingJobIndex === null) return;

    confirmUI("Delete this job permanently?", () => {

      const list = days[dayIndex].timelineList;
      const jobIndex = editingJobIndex;

      let start = jobIndex;
      let count = 1;

      if (list[jobIndex - 1] && list[jobIndex - 1].type === "spot") {
        start = jobIndex - 1;
        count = 2;
      } else if (list[jobIndex + 1] && list[jobIndex + 1].type === "spot") {
        start = jobIndex;
        count = 2;
      }

      list.splice(start, count);

      editingJobIndex = null;
      jobBlock.classList.add("hidden");
      bottomMode = "timeline";
      updateBottomBarMode();

      recalcSpotsFrom(Math.max(0, start - 1));
      enforceJobOrdering?.();

      renderTimeline();
      updateLiveUIState();
      saveAll();
    });
  });

  cancelBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (editorMode === "invoice") {
      editorMode = "draft";   // force reset
      invoiceJobRef = null;   // clear pointer

      jobBlock.classList.add("hidden");

      bottomMode = "timeline";
      updateBottomBarMode();
      return;
    }

    const anyLive = days.some(d => d.timelineList.some(it => it.type === "job" && it.job?.isLive));
    if (anyLive) {
      jobBlock.classList.add("hidden");
      bottomMode = "timeline";
      updateBottomBarMode();
      return;
    }

    // wipe only job-specific fields
    draftJob.title = "";
    draftJob.travelMiles = "";
    draftJob.durationMins = "";
    draftJob.notes = "";
    if (notesBox) notesBox.value = "";

    // keep the default rates
    // draftJob.travelRate stays
    // draftJob.durationRate stays

    // wipe visible inputs
    titleInput.value = "";
    if (travelMilesInput) travelMilesInput.value = "";
    if (durationMinsInput) durationMinsInput.value = "";
    draftJob.people = [];
    peopleList.innerHTML = "";
    resetToolsForNewJob();
    draftJob.inventory = (draftJob.inventory || []).map(it => ({
      name: it.name,
      priceEach: it.priceEach,
      qty: 0
    }));

    renderInventoryFromDraft();      // clears qty inputs + refreshes inv total/badge
    refreshTotalUI();                // updates the main job total
    if (notesValueBox) notesValueBox.textContent = "–";

    // refresh UI values
    refreshDraftUI();
    refreshDurationUI();
    bottomMode = "timeline";
    updateBottomBarMode();

    // close editor
    jobBlock.classList.add("hidden");
  };

  acceptBtn.onclick = async (e) => {
    const current = days[dayIndex].timelineList[editingJobIndex]?.job;
    if (current?.isLive) return;
    e.preventDefault();
    e.stopPropagation();

    if (editorMode === "invoice") {
      if (invoiceJobRef) await shareInvoice(invoiceJobRef);
      return;
    }

    timelineList = days[dayIndex].timelineList;

    // make a clean copy of the draft
    const job = {
      id: Date.now(),
      status: "live",
      createdAt: new Date().toISOString(),

      title: draftJob.title || "",
      invoiceNumber: draftJob.invoiceNumber || null,
      total: calcAutoTotal(),
      travelMiles: safeNum(draftJob.travelMiles),
      travelRate: safeNum(draftJob.travelRate),

      durationMins: safeNum(draftJob.durationMins),
      durationRate: safeNum(draftJob.durationRate),

      startedAt: draftJob.startedAt || null,
      accumulatedMs: draftJob.accumulatedMs || 0,
      actualDurationMins: draftJob.actualDurationMins || null,

      people: (draftJob.people || []).map(p => ({
        name: (p.name || "").trim(),
        mins: safeNum(p.mins),
        rate: safeNum(p.rate)
      })),

      tools: (draftJob.tools || []).map(t => ({
        name: (t.name || "").trim(),
        core: !!t.core,
        checked: !!t.checked
      })).filter(t => t.name),

      inventory: (draftJob.inventory || []).map(it => ({
        name: (it.name || "").trim(),
        priceEach: safeNum(it.priceEach),
        qty: safeNum(it.qty)
      })),

      notes: (draftJob.notes || "").trim()
    };

    if (editingJobIndex !== null) {

      const existing = timelineList[editingJobIndex].job;

      job.state = existing.state;
      job.isLive = existing.isLive;
      job.accumulatedMs = existing.accumulatedMs;

      timelineList[editingJobIndex] = { type: "job", job };

      recalcSpotsFrom(editingJobIndex - 1);
      enforceJobOrdering();
      recalcSpotsFrom(0);
      editingJobIndex = null;
      renderTimeline();
      bottomMode = "timeline";
      updateBottomBarMode();
      jobBlock.classList.add("hidden");

      // ---- update master tools ----
      for (const t of job.tools) {
        if (!masterTools.some(mt => mt.name.toLowerCase() === t.name.toLowerCase())) {
          masterTools.push({ name: t.name, core: !!t.core });
        }
      }

      // ---- update master inventory ----
      for (const it of job.inventory) {
        if (!masterInventory.some(mi => mi.name.toLowerCase() === it.name.toLowerCase())) {
          masterInventory.push({
            name: it.name,
            priceEach: it.priceEach
          });
        }
      }

      masterInventory.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      saveAll();
      return;

    } else {

      // normal new job insertion
    timelineList.splice(activeSpotIndex + 1, 0, { type: "job", job });
    timelineList.splice(activeSpotIndex + 2, 0, { type: "spot", timeMins: 0 });

    enforceJobOrdering();
    recalcSpotsFrom(0);
      editingJobIndex = null;
    }

    renderTimeline();

    // wipe job-specific fields (same as cancel)
    draftJob.title = "";
    draftJob.travelMiles = "";
    draftJob.durationMins = "";
    draftJob.people = [];
    resetToolsForNewJob();
    draftJob.inventory = (draftJob.inventory || []).map(it => ({
      name: it.name,
      priceEach: it.priceEach,
      qty: 0
    }));
    renderInventoryFromDraft();
    draftJob.notes = "";

    // keep default rates
    // draftJob.travelRate stays
    // draftJob.durationRate stays

    // wipe visible inputs
    titleInput.value = "";
    if (travelMilesInput) travelMilesInput.value = "";
    if (durationMinsInput) durationMinsInput.value = "";
    if (notesBox) notesBox.value = "";

    peopleList.innerHTML = "";

    // tools and inventory badges reset
    updateToolsBadgeFromDraft();
    if (invTotalBox) invTotalBox.textContent = "£0.00";
    if (invValueBox) invValueBox.textContent = "–";
    if (notesValueBox) notesValueBox.textContent = "–";

    draftJob.accumulatedMs = 0;
    draftJob.actualDurationMins = null;

    // if you store any cached totals/costs, nuke them too:
    draftJob.total = 0;
    draftJob.travelTotal = 0;
    draftJob.durationTotal = 0;

    // refresh UI values
    refreshTravelUI();
    refreshDurationUI();
    refreshInvTotalLive();
    refreshTotalUI();
    bottomMode = "timeline";
    updateBottomBarMode();

    // ---- update master tools ----
    for (const t of job.tools) {
      if (!masterTools.some(mt => mt.name.toLowerCase() === t.name.toLowerCase())) {
        masterTools.push({ name: t.name, core: !!t.core });
      }
    }

    // ---- update master inventory ----
    for (const it of job.inventory) {
      if (!masterInventory.some(mi => mi.name.toLowerCase() === it.name.toLowerCase())) {
        masterInventory.push({
          name: it.name,
          priceEach: it.priceEach
        });
      }
    }
    saveAll();

    // close editor
    jobBlock.classList.add("hidden");
  };

  function openEditorForSpot(spotIndex) {

    editingJobIndex = null;
    updateCreateUpdateLabel();

    editorMode = "draft";
    invoiceJobRef = null;

    draftJob = {
      title: "",
      invoiceNumber: null,
      travelMiles: "",
      travelRate: draftJob.travelRate || "",
      durationMins: "",
      durationRate: draftJob.durationRate || "",
      actualDurationMins: null,
      people: [],
      tools: masterTools.map(t => ({
        ...t,
        checked: !!t.core
      })),

      inventory: masterInventory.map(it => ({
        name: it.name,
        priceEach: it.priceEach,
        qty: 0
      })),
      notes: "",
      timerMs: 0,
      timerRunning: false,
      timerStartedAt: null,
      accumulatedMs: 0
    };

    // wipe visible editor inputs so UI matches the fresh draftJob
    if (titleInput) titleInput.value = "";
    if (notesBox) notesBox.value = "";

    // these are panel inputs, but clear anyway so nothing "looks carried over"
    if (travelMilesInput) travelMilesInput.value = "";
    if (durationMinsInput) durationMinsInput.value = "";

    // clear people UI list for the new job
    if (peopleList) peopleList.innerHTML = "";
    if (peopleList) peopleList.innerHTML = "";
    refreshPeopleTotalUI();

    activeSpotIndex = spotIndex;

    const spotItem = days[dayIndex].timelineList[spotIndex];
    draftJob.spotStartMins = spotItem.timeMins;

    resetToolsForNewJob();

    draftJob.travelMiles = "";
    draftJob.durationMins = "";
    draftJob.startedAt = null;
    draftJob.accumulatedMs = 0;

    bottomMode = "draft";
    updateBottomBarMode();

    jobBlock.classList.remove("hidden");
    refreshDraftUI();
    refreshTotalUI();
    updateLiveUIState();
  }

  /* ===============================
     TRAVEL
  ================================ */

  travelMilesInput?.addEventListener("input", () => {

    let v = travelMilesInput.value.replace(/\D/g, ""); // numbers only
    if (v.length > 3) v = v.slice(0,3);                // max 3 digits
    if (Number(v) > 100) v = "100";                    // cap at 100

    travelMilesInput.value = v;
    draftJob.travelMiles = v;

    refreshTravelUI();
    refreshTotalUI();

  });

  function refreshTravelUI() {

    // badge value on main job block
    if (travelValueBox) {
      travelValueBox.textContent =
        draftJob.travelMiles ? `${draftJob.travelMiles} mi` : "–";
    }

    // £ total on travel page
    const miles = safeNum(draftJob.travelMiles);
    const rate = safeNum(draftJob.travelRate);
    const total = miles * rate;

    if (travelTotalBox) {
      travelTotalBox.textContent = `£${total.toFixed(2)}`;
    }
  }

  /* ===============================
     DURATION
  ================================ */

  function refreshDurationUI() {

    const totalMins = parseFloat(draftJob.durationMins || "0");
    const rate = parseFloat(draftJob.durationRate || "0");

    // Sync inputs from stored value
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;

    if (durationHoursInput) durationHoursInput.value = hrs || "";
    if (durationMinsInput) durationMinsInput.value = mins || "";

    // ---- Badge (on main job block) ----

    if (totalMins) {

      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;

      let text = "";
      if (hrs) text += `${hrs}h `;
      if (mins) text += `${mins}m`;

      durationValueBox.textContent = text.trim();

    } else {
      durationValueBox.textContent = "–";
    }



    // ---- Cost calculation ----

    if (!totalMins || !rate) {
      if (durationCalcBox) durationCalcBox.textContent = "£0.00";
      return;
    }

    const totalCost = (totalMins / 60) * rate;

    if (durationCalcBox)
      durationCalcBox.textContent = `£${totalCost.toFixed(2)}`;
  }

  durationHoursInput?.addEventListener("input", updateDurationFromInputs);
  durationMinsInput?.addEventListener("input", updateDurationFromInputs);

  function updateDurationFromInputs() {

    const hrs = parseFloat(durationHoursInput.value) || 0;
    let mins = parseFloat(durationMinsInput.value) || 0;

    // Clamp minutes
    if (mins > 59) {
      mins = 59;
      durationMinsInput.value = 59;
    }

    let totalMins = (hrs * 60) + mins;

    // find last spot of the day
    const list = days[dayIndex].timelineList;
    const lastSpot = [...list].reverse().find(it => it.type === "spot");

    const max = lastSpot ? (1440 - lastSpot.timeMins) : 1440;

    if (totalMins > max) totalMins = max;

    draftJob.durationMins = totalMins;

    refreshDurationUI();
    refreshTotalUI();
  }

  /* ===============================
  PEOPLE
  ================================ */

  const peopleListEl = document.getElementById("people-list");
  const peopleNextLabel = document.getElementById("people-next-label");
  const personOkBtn = document.getElementById("person-ok-btn");

  const personNameInput = document.querySelector(".person-name-input");
  const personHoursInput = document.querySelector(".person-hours-input");
  const personMinsInput = document.querySelector(".person-mins-input");
  const personRateInput = document.querySelector(".person-rate-input");

  let editingPersonId = null;

  personHoursInput?.addEventListener("input", () => {

    const max = draftJob.durationMins || 0;
    const maxHours = Math.floor(max / 60);

    let v = personHoursInput.value.replace(/\D/g,"");

    if (Number(v) > maxHours) v = String(maxHours);

    personHoursInput.value = v;

  });

  personMinsInput?.addEventListener("input", () => {

    const max = draftJob.durationMins || 0;

    const hrs = parseInt(personHoursInput.value || "0", 10);
    let mins = parseInt(personMinsInput.value || "0", 10);

    if (mins > 59) mins = 59;

    const total = (hrs * 60) + mins;

    if (total > max) {
      mins = Math.max(0, max - (hrs * 60));
    }

    personMinsInput.value = mins;

  });

  personRateInput?.addEventListener("input", () => {

    let v = personRateInput.value.replace(/[^\d.]/g,"");

    // allow only one decimal
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g,"");
  }

  // limit decimals to 2
  const parts = v.split(".");
  if (parts[1]) parts[1] = parts[1].slice(0,2);
  v = parts.join(".");

  // clamp max value
  if (v !== "" && Number(v) > 500) v = "500";

  if (v !== personRateInput.value) {
    personRateInput.value = v;
  }

});

  function ensurePeopleArray() {
    if (!draftJob.people) draftJob.people = [];
  }

  function peopleLabelForNext() {
    ensurePeopleArray();
    if (peopleNextLabel) peopleNextLabel.textContent = `P${draftJob.people.length + 1}`;
  }

  function clampPersonMins() {
    let mins = parseFloat(personMinsInput.value) || 0;
    if (mins > 59) {
      mins = 59;
      personMinsInput.value = 59;
    }
    return mins;
  }

  function clearPeopleEntry() {
    editingPersonId = null;
    personOkBtn.textContent = "OK";
    personNameInput.value = "";
    personHoursInput.value = "";
    personMinsInput.value = "";
    personRateInput.value = "";
    peopleLabelForNext();
  }

  const peopleTotalBox = document.getElementById("calc-people");

  function refreshPeopleTotalUI() {
    if (!peopleTotalBox) return;

    const people = draftJob.people || [];
    let total = 0;

    for (const p of people) {
      const mins = Number(p.mins || 0);
      const rate = Number(p.rate || 0);
      if (mins > 0 && rate > 0) total += (mins / 60) * rate;
    }

    peopleTotalBox.textContent = `£${total.toFixed(2)}`;
  }

  function renderPeopleList() {

    ensurePeopleArray();
    if (!peopleListEl) return;

    peopleListEl.innerHTML = "";

    draftJob.people.forEach((p, idx) => {

      const row = document.createElement("div");
      row.className = "people-row";
      row.style.cursor = "pointer";

      const del = document.createElement("button");
      del.className = "person-del";
      del.textContent = "X";

      del.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        draftJob.people.splice(idx, 1);

        renderPeopleList();
        updatePeopleBadge?.();
        refreshTotalUI();
        refreshPeopleTotalUI?.();
      };

      const hrs = Math.floor((p.mins || 0) / 60);
      const mins = (p.mins || 0) % 60;

      const rateTxt =
        (p.rate && Number(p.rate) > 0)
          ? `£${Number(p.rate).toFixed(2)}/hr`
          : "£–/hr";

      row.innerHTML = `
        <span class="row-label">P${idx + 1}</span>
        <span style="flex:1; font-weight:800; color:#fff;">${p.name || "–"}</span>
        <span class="row-label" style="margin-left:auto;">${hrs}h ${mins}m</span>
      `;

      row.appendChild(del);

      row.onclick = () => {
        editingPersonId = p.id;
        personOkBtn.textContent = "Update";

        personNameInput.value = p.name || "";
        personHoursInput.value = Math.floor((p.mins || 0) / 60) || "";
        personMinsInput.value = (p.mins || 0) % 60 || "";
        personRateInput.value = (p.rate ?? "") === "" ? "" : p.rate;

        if (peopleNextLabel)
          peopleNextLabel.textContent = `P${idx + 1}`;
      };

      peopleListEl.appendChild(row);
    });

    peopleLabelForNext();
    refreshPeopleTotalUI?.();
  }

  function upsertPersonFromEntry() {
    ensurePeopleArray();

    const name = (personNameInput.value || "").trim();
    if (!name) return;

    const hrs = parseFloat(personHoursInput.value) || 0;
    const mins = clampPersonMins();

    const totalMins = (hrs * 60) + mins;

    const max = draftJob.durationMins || 0;

    let finalMins = totalMins;
    if (finalMins > max) {
      finalMins = max;

      const newHrs = Math.floor(max / 60);
      const newM = max % 60;

      personHoursInput.value = newHrs;
      personMinsInput.value = newM;
    }

    // rate can be blank => £0 contribution
    let rateStr = (personRateInput.value || "").trim();
    let rate = rateStr === "" ? "" : parseFloat(rateStr) || 0;

    if (rate !== "" && rate > 500) {
      rate = 500;
      personRateInput.value = 500;
    }

    if (editingPersonId) {
      const idx = draftJob.people.findIndex(p => p.id === editingPersonId);
      if (idx !== -1) {
        draftJob.people[idx] = { ...draftJob.people[idx], name, mins: totalMins, rate };
      }
    } else {

      const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      draftJob.people.push({ id, name, mins: finalMins, rate });

    }

    clearPeopleEntry();
    renderPeopleList();
    refreshPeopleUI();
    refreshTotalUI();
  }

  personOkBtn?.addEventListener("click", upsertPersonFromEntry);
  personMinsInput?.addEventListener("input", () => { clampPersonMins(); });

  /* Call this when opening People panel or after loading a job into draftJob */
  function refreshPeopleUI() {
    ensurePeopleArray();
    renderPeopleList();
    refreshTotalUI();
  }

  /* ===============================
    EQUIPMENT
  ================================ */

  function updateToolsBadgeFromDraft() {
    const n = (draftJob.tools || []).filter(t => t.checked).length;
    toolsValueBox.textContent = n ? `x${n}` : "–";
  }

  function resetToolsForNewJob() {
    if (!draftJob) return;
    draftJob.tools = (draftJob.tools || []).map(t => ({
      ...t,
      checked: !!t.core,     // only core stays checked
      selected: !!t.core     // if you use selected instead of checked
    }));
    renderToolsFromDraft();
    updateToolsBadgeFromDraft();
  }

  function getToolRows() {
    return [...toolsList.querySelectorAll(".tool-row")];
  }

  function makeToolRow(name = "", checked = false, core = false) {
    const row = document.createElement("div");
    row.className = "tool-row";

    if (core) row.classList.add("core-tool");

    row.innerHTML = `
      <input type="text" class="tool-nameInput" placeholder="Tool.." maxlength="16" />
      <input type="checkbox" class="tool-check" />
      <button class="tool-del">X</button>
    `;

    const nameInput = row.querySelector(".tool-nameInput");
    const check = row.querySelector(".tool-check");
    const del = row.querySelector(".tool-del");

    nameInput.value = name;
    check.checked = checked;

    row.dataset.state = core ? "core" : (checked ? "tick" : "blank");

    check.checked = row.dataset.state !== "blank";
    if (row.dataset.state === "core") {
      row.classList.add("core-tool");
    }

    check.addEventListener("click", () => {

      const name = row.querySelector(".tool-nameInput")?.value.trim();
      if (!name) {
        check.checked = false;
        return;
      }

      const state = row.dataset.state;

      if (state === "blank") {
        row.dataset.state = "tick";
        check.checked = true;
        row.classList.remove("core-tool");
      }
      else if (state === "tick") {
        row.dataset.state = "core";
        check.checked = true;
        row.classList.add("core-tool");
      }
      else {
        row.dataset.state = "blank";
        check.checked = false;
        row.classList.remove("core-tool");
      }

      // persist to masterTools
      const toolName = nameInput.value.trim();
      if (toolName) {
        const mt = masterTools.find(t => t.name.toLowerCase() === toolName.toLowerCase());
        if (mt) {
          mt.core = (row.dataset.state === "core");
          saveAll();
        }
      }

    });

    row.dataset.core = core ? "true" : "false";

    if (core) {
      row.classList.add("core-tool");
    }

    del.onclick = () => {
      row.remove();
      ensureBlankToolRow();
    };

    nameInput.addEventListener("input", () => {
      ensureBlankToolRow();
    });

    nameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        ensureBlankToolRow(true);
      }
    });

    return row;
  }

  function ensureBlankToolRow(focusNew = false) {
    if (!toolsList) return;

    const rows = getToolRows();
    if (rows.length === 0) {
      const r = makeToolRow();
      toolsList.appendChild(r);
      return;
    }

    const last = rows[rows.length - 1];
    const lastInput = last.querySelector(".tool-nameInput");

    if (lastInput && lastInput.value.trim() !== "") {
      const r = makeToolRow();
      toolsList.appendChild(r);

      if (focusNew) {
        r.querySelector(".tool-nameInput")?.focus();
      }
    }
  }

  function getToolsSnapshotUnique() {
    const rows = getToolRows();

    const out = [];
    const seen = new Map(); // key -> index in out

    for (const row of rows) {
      const name = row.querySelector(".tool-nameInput")?.value.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      const checked = !!row.querySelector(".tool-check")?.checked;
      const core = row.classList.contains("core-tool");

      if (!seen.has(key)) {
        seen.set(key, out.length);
        out.push({ name, checked, core });
      } else {
        // merge duplicates
        const i = seen.get(key);
        out[i].checked = out[i].checked || checked;
        out[i].core = out[i].core || core;
      }
    }

    return out;
  }

  function renderToolsFromDraft() {
    if (!toolsList) return;

    toolsList.innerHTML = "";

    const tools = draftJob.tools || [];

    /* sort: core first, then alphabetical */
    tools.sort((a, b) => {
      if (a.core !== b.core) return b.core - a.core;
      return a.name.localeCompare(b.name);
    });

    for (const t of tools) {
      toolsList.appendChild(makeToolRow(t.name, !!t.checked, !!t.core));
    }

    toolsList.appendChild(makeToolRow("", false));
  }

  /* init */
  if (toolsList) {
    if (!draftJob.tools) draftJob.tools = [];
    renderToolsFromDraft();
    updateToolsBadgeFromDraft();
  }

  /* ===============================
    INVENTORY
  ================================ */

  function getInvRows() {
    return [...invList.querySelectorAll(".inv-row")];
  }

  function ensureBlankInvRow(focusNew = false) {
    if (!invList) return;

    const rows = getInvRows();
    if (rows.length === 0) {
      invList.appendChild(makeInvRow());
      return;
    }

    const last = rows[rows.length - 1];
    const lastName = last.querySelector(".inv-name");
    if (!lastName) return;

    if (lastName.value.trim() !== "") {
      const r = makeInvRow();
      invList.appendChild(r);
      if (focusNew) r.querySelector(".inv-name")?.focus();
    }
  }

  function refreshInvTotalLive() {
    const rows = getInvRows();

    let total = 0;
    let usedCount = 0;

    for (const row of rows) {
      const name = row.querySelector(".inv-name")?.value.trim();
      const price = safeNum(row.querySelector(".inv-price")?.value);
      const qty = safeNum(row.querySelector(".inv-qty")?.value);

      if (!name) continue;
      if (qty > 0) usedCount++;

      total += price * qty;
    }

    if (invTotalBox) invTotalBox.textContent = money(total);
    if (invValueBox) invValueBox.textContent = usedCount ? `x${usedCount}` : "–";
  }

  function makeInvRow(name = "", priceEach = "", qty = "") {
    const row = document.createElement("div");
    row.className = "inv-row";

    row.innerHTML = `
      <input type="text" class="inv-name" placeholder="Item." maxlength="18"/>
      <span class="inv-pound">£</span>
      <input type="text" class="inv-price" placeholder="each" inputmode="decimal" maxlength="7"/>
      <span class="inv-times">×</span>
      <input type="text" class="inv-qty" placeholder="Qty" inputmode="numeric" maxlength="4" />
      <button class="inv-del">X</button>
    `;

    const nameInput = row.querySelector(".inv-name");
    const priceInput = row.querySelector(".inv-price");
    const qtyInput = row.querySelector(".inv-qty");
    const del = row.querySelector(".inv-del");

    nameInput.value = name;
    priceInput.value = priceEach;
    qtyInput.value = qty;

    del.onclick = () => {

      const name = nameInput.value.trim().toLowerCase();

      masterInventory = masterInventory.filter(
        it => it.name.toLowerCase() !== name
      );

      saveAll();

      row.remove();
      ensureBlankInvRow();
      refreshInvTotalLive();
    };

    nameInput.addEventListener("input", () => {
      ensureBlankInvRow();
      refreshInvTotalLive();
    });

    nameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        ensureBlankInvRow(true);
      }
    });

    priceInput.addEventListener("input", () => {

      if (priceInput.value) {
        priceInput.placeholder = "£";
      } else {
        priceInput.placeholder = "£ each";
      }

      refreshInvTotalLive();
    });

    qtyInput.addEventListener("input", () => {

      if (qtyInput.value) {
        qtyInput.placeholder = "×";
      } else {
        qtyInput.placeholder = "Qty";
      }

      refreshInvTotalLive();
    });

    return row;
  }

  function getInventorySnapshot() {
    const rows = getInvRows();

    const out = [];
    const seen = new Set();

    for (const row of rows) {
      const name = row.querySelector(".inv-name")?.value.trim();
      const price = safeNum(row.querySelector(".inv-price")?.value);
      const qty = safeNum(row.querySelector(".inv-qty")?.value);

      if (!name) continue;

      // de-dupe by name (case-insensitive)
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // keep even if qty = 0, so it stays in the master list
      out.push({
        name,
        priceEach: price,
        qty
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function renderInventoryFromDraft() {
    if (!invList) return;

    invList.innerHTML = "";

    const items = draftJob.inventory || [];

    for (const it of items) {
      invList.appendChild(
        makeInvRow(
          it.name || "",
          (it.priceEach ?? "") === 0 ? "0" : (it.priceEach ?? "").toString(),
          (it.qty ?? "") === 0 ? "" : (it.qty ?? "").toString()
        )
      );
    }

    invList.appendChild(makeInvRow());
    refreshInvTotalLive();
  }

  // re-render to clean duplicates and keep it tidy
  renderInventoryFromDraft();

  // update main badge from draft snapshot
  const used = (draftJob.inventory || []).filter(it => (it.qty || 0) > 0).length;
  invValueBox.textContent = used ? `x${used}` : "–";


  /* ===============================
    NOTES
  ================================ */

  function refreshNotesUI() {
    if (!notesBox) return;
    notesBox.value = draftJob.notes || "";
  }

  if (notesBox) {
    refreshNotesUI();
  }

  /* ===============================
     TOTAL
  ================================ */

  function calcAutoTotal() {
    const travel = safeNum(draftJob.travelMiles) * safeNum(draftJob.travelRate);

    const durHours = safeNum(draftJob.durationMins) / 60;
    const duration = durHours * safeNum(draftJob.durationRate);

    let inv = 0;
    for (const it of (draftJob.inventory || [])) {
      inv += safeNum(it.priceEach) * safeNum(it.qty);
    }

    // PEOPLE (optional)
    let people = 0;
    for (const p of (draftJob.people || [])) {
      const mins = safeNum(p.mins);
      const rate = safeNum(p.rate);
      if (mins > 0 && rate > 0) {
        people += (mins / 60) * rate;
      }
    }

    return travel + duration + inv + people;
  }

  function calcSavedTotal(job) {
    const travel = safeNum(job.travelMiles) * safeNum(job.travelRate);

    const actual = safeNum(job.actualDurationMins);
    const mins = actual >= 2 ? actual : safeNum(job.durationMins);
    const labour = (mins / 60) * safeNum(job.durationRate);

    let inv = 0;
    for (const it of (job.inventory || [])) {
      inv += safeNum(it.priceEach) * safeNum(it.qty);
    }

    let people = 0;
    for (const p of (job.people || [])) {
      const m = safeNum(p.mins);
      const r = safeNum(p.rate);
      if (m > 0 && r > 0) people += (m / 60) * r;
    }

    return travel + labour + inv + people;
  }

  const panelTravel = document.querySelector(".panel-travel");
  const panelDuration = document.querySelector(".panel-duration");
  const panelPeople = document.querySelector(".panel-people");
  const panelTools = document.querySelector(".panel-tools");
  const panelInventory = document.querySelector(".panel-inventory");
  const panelNotes = document.querySelector(".panel-notes");

  function openPanel(panel) {

    if (panel === panelInventory) renderInventoryFromDraft();

    // --- SYNC PANEL INPUTS FROM draftJob FIRST ---

    if (panel === panelTravel) {
      if (travelMilesInput) travelMilesInput.value = draftJob.travelMiles || "";
      if (travelRateInput) travelRateInput.value = draftJob.travelRate || "";
      refreshTravelUI();
    }

    if (panel === panelDuration) {
      if (durationMinsInput) durationMinsInput.value = draftJob.durationMins || "";
      if (durationRateInput) durationRateInput.value = draftJob.durationRate || "";
      refreshDurationUI();
    }

    jobBlock.classList.add("hidden");
    panel.classList.remove("hidden");
    bottomMode = "panel";
    updateBottomBarMode();
  }

  function closePanels() {

    if (invoiceBlock && !invoiceBlock.classList.contains("hidden")) {
      invoiceBlock.classList.add("hidden");
      invoiceJobRef = null;
      bottomMode = "timeline";
      updateBottomBarMode();
      return;
    }

    draftJob.tools = getToolsSnapshotUnique();

    draftJob.tools.sort((a, b) => {
      if (a.core !== b.core) return (b.core ? 1 : 0) - (a.core ? 1 : 0);
      return (a.name || "").localeCompare(b.name || "");
    });

    updateToolsBadgeFromDraft();
    renderToolsFromDraft();

    draftJob.notes = notesBox.value.trim();
    notesValueBox.textContent = draftJob.notes ? "✓" : "–";

    draftJob.inventory = getInventorySnapshot();
    draftJob.inventory.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderInventoryFromDraft();

    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    jobBlock.classList.remove("hidden");

    bottomMode = "draft";
    updateBottomBarMode();
    refreshDraftUI();
    refreshTotalUI();
  }

  document.getElementById("btn-travel").onclick = () => openPanel(panelTravel);
  document.getElementById("btn-duration").onclick = () => openPanel(panelDuration);
  document.getElementById("btn-people").onclick = () => openPanel(panelPeople);
  document.getElementById("btn-tools").onclick = () => openPanel(panelTools);
  document.getElementById("btn-inventory").onclick = () => openPanel(panelInventory);
  document.getElementById("btn-notes").onclick = () => openPanel(panelNotes);

  document.querySelectorAll(".panel .homeBtn").forEach(btn => {
    btn.onclick = closePanels;
  });

  syncToday();
  const todayIndex = findTodayIndex();
  loadDay(todayIndex);

});
