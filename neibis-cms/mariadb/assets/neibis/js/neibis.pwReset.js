/*
 * neibis.pwReset.js — 관리자 비밀번호 재설정 공통 팝업
 * 목록(user.do)·상세(user-updt.do) 등에서 공통 사용.
 * 사용법: PwReset.open(userId, usid, onSuccess)
 *   - userId  : 대상 회원 user_id
 *   - usid    : 표시용 계정 아이디
 *   - onSuccess(선택): 재설정 성공 후 콜백 (예: 목록/상세 새로고침)
 */
(function (window, $) {
  "use strict";

  var API = "/mariadb/neibis-api/system/user/reset-pw";
  var MODAL_ID = "pw-reset-pop";
  var target = null;      // 현재 대상 userId
  var onDone = null;      // 성공 콜백

  function toast(msg, icon) {
    if (window.Message) { Message.alert({ icon: icon || "info", message: msg }); }
    else { alert(msg); }
  }

  function injectStyleOnce() {
    if (document.getElementById("pw-reset-style")) return;
    var css =
      "#" + MODAL_ID + " .popup-inner{max-width:460px}" +
      "#" + MODAL_ID + " .pw-row{margin-bottom:12px}" +
      "#" + MODAL_ID + " label{display:block;font-weight:700;margin-bottom:4px}" +
      "#" + MODAL_ID + " input{width:100%;box-sizing:border-box}" +
      "#" + MODAL_ID + " .pw-hint{font-size:12px;color:#888;margin-top:2px}";
    var st = document.createElement("style");
    st.id = "pw-reset-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function ensureModal() {
    injectStyleOnce();
    if (document.getElementById(MODAL_ID)) return;
    var html =
      '<div class="modal-popup modal-sm hide" id="' + MODAL_ID + '">' +
      '  <div class="dimed" data-pw-close></div>' +
      '  <div class="popup-inner">' +
      '    <div class="popup-header"><h2 class="popup-title">비밀번호 재설정</h2></div>' +
      '    <div class="popup-body">' +
      '      <p style="margin-bottom:14px">대상 계정: <strong id="pw-reset-usid" class="text-primary"></strong></p>' +
      '      <div class="pw-row">' +
      '        <label for="pw-reset-new">새 비밀번호</label>' +
      '        <input type="password" id="pw-reset-new" class="form-control" autocomplete="new-password" placeholder="8자 이상" />' +
      '        <div class="pw-hint">관리자가 임의로 설정합니다. 8자 이상 입력하세요.</div>' +
      '      </div>' +
      '      <div class="pw-row">' +
      '        <label for="pw-reset-conf">새 비밀번호 확인</label>' +
      '        <input type="password" id="pw-reset-conf" class="form-control" autocomplete="new-password" placeholder="한 번 더 입력" />' +
      '      </div>' +
      '    </div>' +
      '    <div class="popup-footer btn-group-center" style="padding:12px 0">' +
      '      <button type="button" class="btn btn-md btn-outline-gray" data-pw-close>취소</button>' +
      '      <button type="button" class="btn btn-md btn-primary" data-pw-submit>재설정</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    $(document.body).append(html);

    // 이벤트 위임(모달은 1회만 생성되므로 직접 바인딩)
    var $m = $("#" + MODAL_ID);
    $m.on("click", "[data-pw-close]", function () { PwReset.close(); });
    $m.on("click", "[data-pw-submit]", function () { PwReset.submit(); });
    $m.on("keydown", "#pw-reset-conf", function (e) { if (e.key === "Enter") PwReset.submit(); });
  }

  var PwReset = {
    open: function (userId, usid, onSuccess) {
      if (!userId) { toast("대상 회원 정보가 없습니다.", "warning"); return; }
      ensureModal();
      target = String(userId);
      onDone = (typeof onSuccess === "function") ? onSuccess : null;
      $("#pw-reset-usid").text(usid || userId);
      $("#pw-reset-new").val("");
      $("#pw-reset-conf").val("");
      $("#" + MODAL_ID).removeClass("hide");
      setTimeout(function () { $("#pw-reset-new").focus(); }, 50);
    },
    close: function () {
      $("#" + MODAL_ID).addClass("hide");
      target = null; onDone = null;
    },
    submit: function () {
      var pw = $("#pw-reset-new").val() || "";
      var cf = $("#pw-reset-conf").val() || "";
      if (pw.length < 8) { toast("비밀번호는 8자 이상이어야 합니다.", "warning"); return; }
      if (pw !== cf) { toast("두 비밀번호가 일치하지 않습니다.", "warning"); return; }
      var uid = target, cb = onDone;
      $.ajax({
        url: API, method: "POST", contentType: "application/json",
        data: JSON.stringify({ userId: uid, newPassword: pw })
      })
        .done(function (res) {
          if (res && res.ok) { PwReset.close(); toast(res.message, "success"); if (cb) cb(res); }
          else { toast((res && res.message) || "재설정 실패", "error"); }
        })
        .fail(function () { toast("비밀번호 재설정 요청 실패", "error"); });
    }
  };

  window.PwReset = PwReset;
})(window, jQuery);
