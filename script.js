<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DaySpecs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="./style.css?v=99">
</head>

<body>

<div id="phone">

  <!-- =========================
       TOP BAR
  ========================== -->
  <div id="top-bar">
    <button class="hdr-btn hdr-left" id="btn-prev">‹</button>
    <button class="hdr-centre" id="btn-calendar"></button>
    <button class="hdr-btn hdr-right" id="btn-next">›</button>
  </div>


  <!-- =========================
       MAIN AREA (ALWAYS VISIBLE)
  ========================== -->
  <div id="main-area">

    <div id="timeline-line"></div>
    <div id="time-top">00:00</div>

    <div id="job-stack">
      <div id="timeline-stack"></div>
    </div>

  </div>

  <!-- =========================
       BOTTOM BAR
  ========================== -->
  <div id="bottom-bar">
    <button id="bot-back" class="hidden">← Prev Page</button>
    <button id="bot-range" class="bot-range-btn"></button>
    <button id="bot-start" type="button">▶ Start</button>
    <div id="bot-timer">00:00</div>
    <button id="bot-complete" type="button">✓ Complete</button>
  </div>

</div>


<!-- =========================
     TRAVEL PANEL
========================== -->
<div class="panel panel-travel overlay hidden">
  <div class="panel-content">
    <div class="page-title">Travel</div>

    <div class="travel-row">
      <input class="travel-miles" type="number" min="0" max="100" step="1">
      <span class="row-label">Miles</span>
    </div>

    <div class="travel-row">
      <span class="currency">£</span>
      <input class="travel-rate"  type="number" min="0" max="100" step="0.01">
      <span class="row-label">per mile</span>
    </div>

    <div class="travel-total" id="calc-travel">£0.00</div>
  </div>
</div>


<!-- =========================
     DURATION PANEL
========================== -->
<div class="panel panel-duration overlay hidden">
  <div class="panel-content">
    <div class="page-title">Duration (inc travel time)</div>

    <div class="duration-row">
      <input type="number" class="duration-hours" min="0" />
      <span class="row-label">hrs</span>

      <input type="number" class="duration-mins" min="0" max="59" />
      <span class="row-label">mins</span>
    </div>

    <div class="duration-row">
      <span class="currency">£</span>
      <input type="number" class="duration-rate" min="0" step="0.01" />
      <span class="row-label">per hour</span>
    </div>

    <div class="duration-total" id="calc-duration">£0.00</div>
  </div>
</div>

<!-- =========================
     PEOPLE PANEL
========================== -->
<div class="panel panel-people overlay hidden">
  <div class="panel-content">
    <div class="panel-head">
      <div class="page-title">People</div>
      <div class="panel-total" id="calc-people">£0.00</div>
    </div>

    <!-- Entry block -->
    <div class="people-entry">
      <div class="people-entry-head">
        <div class="people-entry-label" id="people-next-label">P1</div>
      </div>

      <div class="people-row">
        <input type="text" class="person-name-input" placeholder="Name" maxlength="13" />
      </div>

      <div class="people-row">
        <input type="number" class="person-hours-input" min="0" />
        <span class="row-label">hrs</span>

        <input type="number" class="person-mins-input" min="0" max="59" />
        <span class="row-label">mins</span>
      </div>

      <div class="people-row">
        <span class="currency">£</span>
        <input type="number" class="person-rate-input" min="0" step="0.01">
        <span class="row-label">per hour</span>

        <button class="person-ok-btn" id="person-ok-btn">OK</button>
      </div>
    </div>

    <!-- Saved people -->
    <div class="people-list" id="people-list"></div>
  </div>
</div>

<!-- =========================
     TOOLS PANEL
========================== -->
<div class="panel panel-tools overlay hidden">
  <div class="panel-content">
    <div class="page-title">Equipment</div>
    <div class="tools-list"></div>
  </div>
</div>

<!-- =========================
     INVENTORY PANEL
========================== -->
<div class="panel panel-inventory overlay hidden">
  <div class="panel-content">

    <div class="panel-head">
      <div class="page-title">Materials</div>
      <div class="panel-total" id="calc-inventory">£0.00</div>
    </div>

    <div class="inventory-list"></div>

  </div>
</div>

<!-- =========================
     NOTES PANEL
========================== -->
<div class="panel panel-notes overlay hidden">
  <div class="panel-content">
    <div class="page-title">Details</div>
    <textarea class="notes-box" placeholder="Notes etc..." maxlength="500" wrap="soft"></textarea>
  </div>
</div>

<!-- Comfirm Delete-->

<div id="confirmOverlay" class="confirm hidden">
  <div class="confirm-card">
    <div id="confirmMsg" class="confirm-msg">Delete this job?</div>
    <div class="confirm-actions">
      <button id="confirmNo" class="btn-lite">No</button>
      <button id="confirmYes" class="btn-danger">Yes</button>
    </div>
  </div>
</div>

<!-- =========================
     JOB EDITOR POPUP (GLOBAL)
     IMPORTANT: OUTSIDE #pages
========================== -->
<div class="job-block hidden">

  <div class="job-card">

    <div class="job-title-row">
      <input id="job-title" type="text" placeholder="Title" maxlength="17" />
    </div>

    <div class="job-meta">
      <div class="job-row" id="btn-travel">
        <span class="job-label">Travel</span>
        <span class="job-value" id="val-travel">–</span>
      </div>

      <div class="job-row" id="btn-duration">
        <span class="job-label">Duration</span>
        <span class="job-value" id="val-duration">–</span>
      </div>

      <div class="job-row" id="btn-people">
        <span class="job-label">People</span>
        <span class="job-value" id="val-people">–</span>
      </div>

      <div class="job-row" id="btn-tools">
        <span class="job-label">Equipment</span>
        <span class="job-value" id="val-tools">–</span>
      </div>

      <div class="job-row" id="btn-inventory">
        <span class="job-label">Materials</span>
        <span class="job-value" id="val-inventory">–</span>
      </div>

      <div class="job-row" id="btn-notes">
        <span class="job-label">Details</span>
        <span class="job-value" id="val-notes">–</span>
      </div>

    </div>

    <div class="job-total-row">
      <div class="job-total-label">Total</div>
      <div class="job-total-box" id="calc-total">£0.00</div>
    </div>

    <div class="job-actions">
      <button id="btn-delete">Del</button>
      <button id="btn-cancel">Timeline</button>
      <button id="btn-accept">Accept</button>
    </div>

</div>
</div>

<!-- =========================
     INVOICE PREVIEW (mini when on badge)
========================== -->
<div id="invoice-block" class="hidden">
  <div class="invoice-card">
    <button id="btn-invoice-copy" class="invoice-copy" type="button" title="Copy">⧉</button>
    <div class="invoice-paper-wrapper">
      <div id="invoice-paper">
        <div class="inv-header">
          <div class="inv-company" contenteditable="true">Your Company</div>
          <div class="inv-meta">
            <div class="inv-number"></div>
            <div class="inv-date"></div>
          </div>
        </div>

        <div class="inv-customer"></div>
        <div class="inv-notes"></div>

        <div class="inv-breakdown">
            <div class="row travel"></div>
            <div class="row labour"></div>
            <div class="row materials"></div>
            <div class="inv-material-lines"></div>
            <div class="row tax">
              <span>VAT (<input id="vat-rate" type="number" min="0" max="100" step="0.1">%)</span>
              <span class="vat-value"></span>
            </div>
            <div class="row total"></div>
        </div>
      </div>
    </div>

    <div class="invoice-actions">
      <button id="btn-invoice-back" type="button">Back</button>
      <button id="btn-invoice-share" type="button">Share</button>
    </div>
  </div>
</div>


<div id="time-block" class="time-block hidden">

  <div class="time-panel">

    <div class="time-title">Set day time</div>

    <div class="time-row">
      <div class="time-label">Start</div>
      <input id="start-time" type="time" step="60">
    </div>

    <div class="time-actions">
      <button id="btn-time-cancel">Cancel</button>
      <button id="btn-time-set">Set</button>
    </div>

  </div>
</div> <!-- end time-block -->

<script src="./script.js?v=2"></script>
</body>
</html>
