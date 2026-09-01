(function () {
	"use strict";

	function alertUser(message, callback) {
		window.uiAlert(message, callback);
	}

	function confirmUser(options, callback) {
		window.uiConfirm(options, callback);
	}

	function copyValue(selector) {
		var target = document.querySelector(selector);
		if (!target || !target.value) {
			alertUser("복사할 내용이 없습니다.");
			return;
		}
		var fallback = function () {
			target.focus();
			target.select();
			document.execCommand("copy");
			alertUser("클립보드에 복사했습니다.");
		};
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(target.value)
				.then(function () { alertUser("클립보드에 복사했습니다."); })
				.catch(fallback);
			return;
		}
		fallback();
	}

	document.addEventListener("click", function (event) {
		var button = event.target.closest("[data-copy-target]");
		if (button) copyValue(button.getAttribute("data-copy-target"));
	});

	function validUseUrl(value) {
		try {
			var url = new URL(value);
			if (url.protocol === "https:") return true;
			return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].indexOf(url.hostname) >= 0;
		} catch (ignore) {
			return false;
		}
	}

	var keyPage = document.querySelector("[data-openapi-key-page]");
	var keyForm = document.getElementById("openApiKeyForm");
	if (keyPage && keyForm) {
		keyForm.addEventListener("submit", function (event) {
			event.preventDefault();
			var useUrlInput = document.getElementById("useUrlAddr");
			var purposeInput = document.getElementById("usePrpsCn");
			var agreementInput = document.getElementById("cprgtPlcyAgreYn");
			var submitButton = document.getElementById("issueApiKeyButton");
			var useUrl = useUrlInput.value.trim();
			var purpose = purposeInput.value.trim();

			if (!validUseUrl(useUrl)) {
				useUrlInput.focus();
				alertUser("사용 URL은 https 주소로 입력해 주세요. 로컬 개발 주소는 http://localhost만 허용됩니다.");
				return;
			}
			if (!purpose || purpose.length > 1000) {
				purposeInput.focus();
				alertUser("사용 목적을 1,000자 이내로 입력해 주세요.");
				return;
			}
			if (!agreementInput.checked) {
				agreementInput.focus();
				alertUser("저작권 정책을 확인하고 동의해 주세요.");
				return;
			}

			confirmUser({
				icon: "warning",
				title: "Open API 인증키 발급",
				message: "입력한 정보로 인증키를 발급하시겠습니까?"
			}, function (confirmed) {
				if (!confirmed) return;
				submitButton.disabled = true;
				fetch(keyPage.getAttribute("data-issue-url"), {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": "Bearer " + keyPage.getAttribute("data-jwt-token")
					},
					body: JSON.stringify({
						useUrlAddr: useUrl,
						usePrpsCn: purpose,
						cprgtPlcyAgreYn: "Y"
					})
				}).then(function (response) {
					return response.json().then(function (body) { return { ok: response.ok, body: body }; });
				}).then(function (result) {
					if (!result.ok) {
						alertUser(result.body && result.body.message ? result.body.message : "인증키를 발급할 수 없습니다.");
						return;
					}
					alertUser(result.body.message || "Open API 인증키가 발급되었습니다.", function () {
						window.location.reload();
					});
				}).catch(function () {
					alertUser("인증키 발급 중 오류가 발생했습니다.");
				}).finally(function () {
					submitButton.disabled = false;
				});
			});
		});
	}

	var guide = document.querySelector("[data-openapi-guide]");
	var testForm = document.getElementById("openApiTestForm");
	if (guide && testForm) {
		testForm.addEventListener("submit", function (event) {
			event.preventDefault();
			var apiKeyInput = document.getElementById("testApiKey");
			var searchWordInput = document.getElementById("testSearchWord");
			if (!apiKeyInput.value.trim()) {
				apiKeyInput.focus();
				alertUser("API 인증키를 입력해 주세요.");
				return;
			}
			if (!searchWordInput.value.trim()) {
				searchWordInput.focus();
				alertUser("검색어를 입력해 주세요.");
				return;
			}

			var parameters = new URLSearchParams();
			new FormData(testForm).forEach(function (value, key) {
				if (String(value).trim()) parameters.set(key, String(value).trim());
			});
			var requestUrl = guide.getAttribute("data-api-url") + "?" + parameters.toString();
			document.getElementById("generatedApiUrl").value = window.location.origin + requestUrl;
			var output = document.getElementById("openApiResult");
			output.value = "요청 중입니다...";
			fetch(requestUrl, { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store" })
				.then(function (response) { return response.json(); })
				.then(function (body) { output.value = JSON.stringify(body, null, 2); })
				.catch(function () { output.value = "API 호출 중 오류가 발생했습니다."; });
		});
	}
})();
