/**
 * 다음 우편번호 서비스(팝업)
 * Key를 발급받을 필요가 없습니다.사용량에 대한 제한은 전혀 없습니다.기업용이든 상업적 용도이든 상관없이 무조건 무료로 사용 가능합니다.
 * 도로명 주소, 지번 주소, 영문 주소까지 모두 확인 가능합니다.
 * 행정자치부에서 제공하는 주소 DB를 직접 업데이트 받고 있으므로 가장 최신의 데이터를 이용하실 수 있습니다.
 * PC 및 모바일웹 환경에서 일반적으로 사용되는 모든 브라우저를 지원합니다.
 * https 환경에서 사용하시려면 https 사용가이드를 참고하세요.
 * 하단 로고를 임의로 가릴 경우, 사용에 제약이 발생할 수 있습니다.
 */
var DAUM_POSTCODE_SCRIPT_ID = 'daum-postcode-script';
var DAUM_POSTCODE_SCRIPT_URL = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

function loadDaumPostcode(callback) {
	if (window.daum && window.daum.Postcode) {
		callback();
		return;
	}

	var script = document.getElementById(DAUM_POSTCODE_SCRIPT_ID);
	if (script) {
		script.addEventListener('load', function() {
			callback();
		});
		script.addEventListener('error', function() {
			alert('주소검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
		});
		return;
	}

	script = document.createElement('script');
	script.id = DAUM_POSTCODE_SCRIPT_ID;
	script.src = DAUM_POSTCODE_SCRIPT_URL;
	script.onload = function() {
		callback();
	};
	script.onerror = function() {
		if (script.parentNode) {
			script.parentNode.removeChild(script);
		}
		alert('주소검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
	};
	document.head.appendChild(script);
}

function zipDaumPopup() {
	loadDaumPostcode(function() {
	new daum.Postcode({
		oncomplete: function(data) {
			// 팝업에서 검색결과 항목을 클릭했을때 실행할 코드를 작성하는 부분.

			// 도로명 주소의 노출 규칙에 따라 주소를 조합한다.
			// 내려오는 변수가 값이 없는 경우엔 공백('')값을 가지므로, 이를 참고하여 분기 한다.
			var fullRoadAddr = data.roadAddress; // 도로명 주소 변수
			var extraRoadAddr = ''; // 도로명 조합형 주소 변수



			// 법정동명이 있을 경우 추가한다. (법정리는 제외)
			// 법정동의 경우 마지막 문자가 "동/로/가"로 끝난다.
			if(data.bname !== '' && /[동|로|가]$/g.test(data.bname)){
			    extraRoadAddr += data.bname;
			}
			// 건물명이 있고, 공동주택일 경우 추가한다.
			if(data.buildingName !== '' && data.apartment === 'Y'){
			   extraRoadAddr += (extraRoadAddr !== '' ? ', ' + data.buildingName : data.buildingName);
			}
			// 도로명, 지번 조합형 주소가 있을 경우, 괄호까지 추가한 최종 문자열을 만든다.
			if(extraRoadAddr !== ''){
			extraRoadAddr = ' (' + extraRoadAddr + ')';
			}
			// 도로명, 지번 주소의 유무에 따라 해당 조합형 주소를 추가한다.
			if(fullRoadAddr !== ''){
			    fullRoadAddr += extraRoadAddr;
			}

			// 우편번호와 주소 정보를 해당 필드에 넣는다.
			document.getElementById('zip').value = data.zonecode; //5자리 새우편번호 사용
			if(data.userSelectedType =="R" && data.userLanguageType =="K"){
				document.getElementById('adres').value = fullRoadAddr;				//국문 도로명
			}else if(data.userSelectedType =="J" && data.userLanguageType =="K"){
				document.getElementById('adres').value = data.jibunAddress;			//국문 지번
			}else if(data.userSelectedType =="R" && data.userLanguageType =="E"){
				document.getElementById('adres').value = data.roadAddressEnglish;	//영문 도로명
			}else if(data.userSelectedType =="J" && data.userLanguageType =="E"){
				document.getElementById('adres').value = data.jibunAddressEnglish;	//영문 지번
			}else{ //예외처리
				document.getElementById('adres').value = fullRoadAddr;				//국문 도로명
			}

			// 사용자가 '선택 안함'을 클릭한 경우, 예상 주소라는 표시를 해준다.
			/*
			if(data.autoRoadAddress) {
			    //예상되는 도로명 주소에 조합형 주소를 추가한다.
			    var expRoadAddr = data.autoRoadAddress + extraRoadAddr;
			    document.getElementById('guide').innerHTML = '(예상 도로명 주소 : ' + expRoadAddr + ')';

			} else if(data.autoJibunAddress) {
			    var expJibunAddr = data.autoJibunAddress;
			    document.getElementById('guide').innerHTML = '(예상 지번 주소 : ' + expJibunAddr + ')';

			} else {
			    document.getElementById('guide').innerHTML = '';
			}*/
		}
	}).open();
	});
}

/**
 * 팝업화면 중앙처리
 * @param urls.win
 */
function fn_neibis_popup_centr(urls, windowNm, w, h, scrollopt) {
    var wl = (window.screen.width/2)  - (w/2 + 10);
    var wt = (window.screen.height/2) - (h/2 + 50);

    var opts = "status=no,height="+h+",width="+w+",resizable=no,left="+wl+",top="+wt+",screenX="+wl+",screenY="+wt+",scrollbars="+scrollopt;
    popwin = window.open( urls, windowNm, opts );
    if (popwin) popwin.focus();
    return popwin;
}

/**
 * 로그인연장 팝업
 * javascript window.open() 으로 팝업 호출시 팝업이 화면의 중앙에 뜨도록(screen center align) 하는 방법 (듀얼모니터 고려)
 * If you're on dual monitor, the window will center horizontally, but not vertically... use this function to account for that.
 * 출처 : https://stackoverflow.com/questions/4068373/center-a-popup-window-on-screen
 */
function fn_neibis_dualpopupCentr(url, title, w, h) {
	// Fixes dual-screen position                         Most browsers      Firefox
	var dualScreenLeft = window.screenLeft != undefined ? window.screenLeft : screen.left;
	var dualScreenTop = window.screenTop != undefined ? window.screenTop : screen.top;

	var width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
	var height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;

	var left = ((width / 2) - (w / 2)) + dualScreenLeft;
	var top = ((height / 2) - (h / 2)) + dualScreenTop;
	var newWindow = window.open(url, title, 'scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left);

	// Puts focus on the newWindow
	if (window.focus) {
		newWindow.focus();
	}
}


/**
 * (공통)사이트별 메인 공지관리 팝업창
 */
function fn_notice_popup(urls, winname, w, h, wl, wt) {
	//console.log("wl : " + wl)
	//console.log("wt : " + wt)
	var opts = "status=no,height="+h+",width="+w+",resizable=no,left="+wl+",top="+wt+",scrollbars=yes";
	popwin = window.open( urls, winname, opts );
	if (popwin) popwin.focus();
	return popwin;
}

/**
 * (공통)사이트별 메인 공지관리 팝업창 isWinOpen 체크
 */
function isWindowOpen(_var) {
	var todayDate = new Date();
	var ServiceSuspend = getNeibisCookie(_var);  //

	if (ServiceSuspend ==null || ServiceSuspend <= todayDate ) {
		return true;
	}
	return false;
}

/**
 * (공통)사이트별 메인 공지관리 팝업창 쿠키정보
 */
function getNeibisCookie(_var) {
	_var += "=";
	startpos = document.cookie.indexOf(_var);
	if (startpos >= 0) {
		startpos += _var.length;
		endpos = document.cookie.indexOf(";", startpos);
		if (endpos == -1) endpos = document.cookie.length;
		return unescape(document.cookie.substring(startpos, endpos));
	}
}

// 사용자가 선택한 정의된 범위 옵션에 따라 폼에 날짜 범위를 설정합니다.
var getDateRange = function(e,_this){

    // 트리거 요소의 가장 가까운 부모 폼 요소를 찾습니다.
	let target=   $(_this).closest('form');

    // 선택된 옵션의 값을 검색합니다.
	let value = $(_this).val()
	let today;
	// 선택된 옵션에 따라 'today' 날짜를 결정합니다.
	if(value == "1d" || value=="-1")	 today = getLastDate(3, -1)
	else if(value == "7d" || value== "-7") today = getLastDate(3, -7)
	else if(value == "1m" || value == "1") today = getLastDate(2, -1)
	else if(value == "3m" || value== "3") today = getLastDate(2, -3)
	else if(value == "6m" || value== "6") today = getLastDate(2, -6)
	else if(value == "12m" || value== "12") today = getLastDate(1, -1)

    // 폼에 시작 날짜 입력을 설정합니다.
	target.find('input[name=searchStartDt]').val(getYear(today) + "." + getMonth(false, today) + "." + getDate(today));

	// 폼에 종료 날짜 입력을 오늘 날짜로 설정합니다.
	target.find('input[name=searchEndDt]').val(getYear() + "." + getMonth() + "." + getDate());

}

// getYear 제공된 날짜의 전체 연도를 반환하거나, 날짜가 제공되지 않은 경우 현재 날짜의 연도를 반환합니다.
// @param date: Date 객체 (선택적).
// @returns: 숫자로 된 전체 연도.
function getYear(date){
	let today = new Date();
	if(date != null || date != undefined) today=date;

	return today.getFullYear();
}

// getMonth 제공된 날짜의 월을 반환하거나, 날짜가 제공되지 않은 경우 현재 날짜의 월을 반환합니다.
// @param flag: 월 번호를 하나 증가시키는지 여부를 나타내는 부울 값 (포맷팅 목적).
// @param date: Date 객체 (선택적).
// @returns: 10보다 작을 경우 0이 앞에 붙는 문자열로 된 월.
function getMonth(flag,date){
	let today = new Date();
	if(date != null || date != undefined) today=date;

	let month = today.getMonth();
	if(!flag) month = month +1  //사람이 읽을 수 있도록 월을 1-12로 조정 (0-11 대신).
	if(month < 10) month = "0" + month;

	return month;
}

// getDate 제공된 날짜의 일을 반환하거나, 날짜가 제공되지 않은 경우 현재 날짜의 일을 반환합니다.
// @param date: Date 객체 (선택적).
// @returns: 10보다 작을 경우 0이 앞에 붙는 문자열로 된 일.
function getDate(date){
	let today = new Date();
	if(date != null || date != undefined) today=date;

	var date = today.getDate();
	if(date < 10) date = "0" + date;

	return date;
}


// 연도, 월 또는 일을 조정하여 과거 또는 미래의 날짜를 계산합니다.
// @param flag: 날짜의 어떤 구성 요소를 조정할지를 나타내는 정수 (1=연도, 2=월, 3=일).
// @param rageNum: 날짜를 조정할 단위의 수를 나타내는 정수.
// @returns: 조정된 Date 객체.
function getLastDate(flag, rageNum){
	let _this = this;
	let lastDate = new Date(_this.getYear(), _this.getMonth(true), _this.getDate());

	if(flag == 1) lastDate.setFullYear(lastDate.getFullYear() + rageNum);
	if(flag == 2) lastDate.setMonth(lastDate.getMonth() + rageNum);
	if(flag == 3) lastDate.setDate(lastDate.getDate() + rageNum);

	return lastDate;
}

// 폼에 사용될 숨겨진 입력 요소를 생성합니다.
// @param name: 입력 요소의 name 속성.
// @param value: 입력 요소의 value 속성.
// @returns: 숨겨진 입력 요소를 나타내는 jQuery 객체.
function createHiddenInput(name,value){

	return  $("<input>").attr("type","hidden").attr("name",name).val(value);
}


// 폼 내의 모든 입력 요소를 기본값으로 재설정합니다.
// @param form: 재설정할 폼을 나타내는 jQuery 객체.
function formResetAction(form){
	 // 'id' 또는 'name' 속성에 'search'를 포함하는 input[type='text'] 요소들을 찾아 값을 비웁니다.
    form.find("input[type='text'][id*='search'], input[type='text'][name*='search']").val('');

    //'id' 또는 'name' 속성에 'search' 또는 'pageItm'이 포함된 select 요소를 찾습니다.
     form.find("select[id*='search'], select[name*='search'], select[id*='pageItm'], select[name*='pageItm']").each(function() {
        // 각 select 요소의 첫 번째 옵션을 선택합니다.
        $(this).find("option:first").prop("selected", true);
        // 선택 변경 이벤트를 강제로 발생시킵니다.
        $(this).change();
    });

	// 'id' 또는 'name' 속성에 'search'를 포함하는 input[type='checkbox'] 요소들의 체크를 해제합니다.
    form.find("input[type='checkbox'][id*='search'], input[type='checkbox'][name*='search']").prop("checked", false);

       // 라디오 버튼 처리: 'search'를 포함하는 각 라디오 버튼 그룹에서 첫 번째 요소만 체크합니다.
    form.find("input[type='radio'][id*='search'], input[type='radio'][name*='search']").each(function() {
        // 라디오 버튼의 name 속성 값을 가져옵니다.
        let radioName = $(this).attr('name');
        // 같은 name을 가진 첫 번째 라디오 버튼만 체크하고, 나머지는 해제합니다.
        form.find(`input[type='radio'][name='${radioName}']:first`).prop("checked", true);
    });

    form.find("input[type='radio'][name='searchDateRange']").prop("checked", false);

}

function formInputAttPassword(id){
    $("#" + id + " .btn-pw").each(function() {
        var textField = $(this).prev(".form-pw[type='text']");
        if (textField.length) {
            textField.attr("type", "password");
            $(this).val("show");
        }
    });
}


/**
 * HTML 문자열에서 스크립트와 모든 HTML 태그를 제거하고 HTML 엔티티를 디코드하는 함수.
 *
 * @param {string} str - 디코드할 HTML 문자열.
 * @returns {string} 태그가 제거되고 HTML 엔티티가 디코드된 순수 텍스트 문자열.
 *
 * 주요 기능:
 * 1. 입력된 문자열이 유효한 경우에만 처리.
 * 2. `<script>` 태그 및 해당 내용 제거를 통해 XSS 공격 방지.
 * 3. 모든 HTML 태그 제거.
 * 4. DOM을 사용하여 HTML 엔티티를 안전하게 디코드.
 */
function decodeHtmlEntities(str){
	// 입력 값이 유효한지 확인
	if(str !== undefined && str !== null && str !='' ){
	    // 입력 값을 문자열로 강제 변환
		str = String(str);
		// 스크립트 태그와 내용 제거
		str= str.replace(/<script[>^]*>([\S\s]*?)<\/script>/gmi, '');
		// 모든 HTML 태그 제거
		str= str.replace(/<\/?\w(?:[^"'>]|]"[^"]*"|'[^']*)*>/gmi, '');
		// 임시 DOM 요소 생성
		var element = document.createElement('div');
		// HTML 문자열을 DOM에 삽입하여 엔티티 디코드
		element.innerHTML = str;
		// 순수 텍스트 추출
		str = element.textContent;
		// 임시 요소 초기화
		element.textContent = '' ;
	}
	return str;
}

function validErrorProc(id,msg){
	//var errorArea = typeof $("#"+id).closest("td").html() !== "undefined" ? $("#"+id).closest("td") : $("#"+id).closest("div");

	var $element = $("#" + id);
	var errorArea = $element.closest("td").length ? $element.closest("td") : $element.closest("div");


	// 웹 에디터일 경우, 필수입력 메세지 출력위치 변경
	if ($element.hasClass("html-code")) {
        errorArea = $element.closest(".html-editor-area");
    }else if($element.attr("id") == "ovrvwCn"){
       errorArea = $element.closest(".guide-item");
    }

	errorArea.append($("<span>").addClass("text-guide text-invalid").text(msg).attr("id", "targetErrorElement"));  // ID 속성 추가);

	// 보이는 요소로 스크롤 및 포커스 처리
    var $visibleFocusTarget = findVisibleFocusTarget($element);

    if ($element.hasClass("html-code")) {
    	var targetTop = $("#targetErrorElement").offset().top;
    	 $("html, body").animate({ scrollTop: targetTop - 100 }, 400, function() {
			  $("#targetErrorElement").focus();
	       });
    }else if($visibleFocusTarget.length) {
        $("html, body").animate({ scrollTop: $visibleFocusTarget.offset().top - 100 }, 400, function() {
            $visibleFocusTarget.focus();
        });
    }else {
        console.log('No visible element found to focus.');
    }


}

function findVisibleFocusTarget($element) {
    // 요소 자체가 보이면 해당 요소 반환
    if ($element.is(':visible')) {
        return $element;
    }

    // 가까운 보이는 부모 또는 형제 요소 검색
    var $focusTarget = $element.parents().addBack().siblings().filter(':visible').first();

    return $focusTarget;
}


/**
 * 동적 HTML 생성 - 페이징영역
 *
 * @param paginationInfo- 페이징 파라미터
 * @param func - 이동 함수
 *
 */
function paginationHtml(paginationInfo,func){
	let pageSize = paginationInfo.pageSize +1;
	let html = "";
	html +=  '<div class="pagination">';
	if(paginationInfo.totalPageCount > pageSize && paginationInfo.currentPageNo > paginationInfo.firstPageNo){
		html += 	"<a href='javascript:void(0);' class='direction first' onclick="+func+"('"+paginationInfo.firstPageNo+"')>처음</a>";
	}
	if(paginationInfo.currentPageNo > paginationInfo.firstPageNo){
		html += 	"<a href='javascript:void(0);' class='direction prev' onclick="+func+"('"+(paginationInfo.currentPageNo-1) +"')>이전</a>";
	}
 	for(let i = paginationInfo.firstPageNoOnPageList; i <= paginationInfo.lastPageNoOnPageList; i++){
 		if(i == paginationInfo.currentPageNo){
 			html +=  "<strong>"+paginationInfo.currentPageNo+"</strong> ";
 		}else{
 			html +=  "<a href='javascript:void(0);' onclick="+func+"('"+i+"')"+">"+i+"</a>";
 		}
 	}
	if(paginationInfo.currentPageNo < paginationInfo.totalPageCount){
	html += "<a href='javascript:void(0);' class='direction next' onclick="+func+"('"+(parseInt(paginationInfo.currentPageNo)+1) +"')>다음</a>";
	}
	if(parseInt(paginationInfo.totalPageCount) >= pageSize && paginationInfo.currentPageNo < paginationInfo.totalPageCount){
		html += "<a href='javascript:void(0);' class='direction last' onclick="+func+"('"+paginationInfo.lastPageNo +"')>끝</a>"
	}
	html += "</div>";
	return html;
}

function showLoadingbar(){
 	$('.loadingbar').removeClass('hide').addClass('show');
}
function hideLoadingBar(){
	$('.loadingbar').removeClass('show').addClass('hide');
}


/**
 * 날짜 문자열을 'YYYY.MM.DD' 형식으로 포맷팅하는 메소드
 *
 * @param dateStr 'YYYYMMDD' 형식의 날짜 문자열
 * @return 'YYYY.MM.DD' 형식의 날짜 문자열
 */
function formatDateWithDots(dateStr) {
    // 연도 부분 추출 및 추가
    return dateStr.substring(0, 4) + '.' + dateStr.substring(4, 6) + '.' + dateStr.substring(6, 8);
}


// 웹에디터 탭메뉴
function toggleTabs(showSelector, hideSelector) {
	$(showSelector).css({
		position: "relative",
		left: "0",
		visibility: "visible"
	});
	$(hideSelector).css({
		position: "absolute",
		left: "-9999px",
		visibility: "hidden"
	});
}

function codeToggleTabs(){
	toggleTabs(".html-editor-area .codes-area", ".html-editor-area .webeditor-area");
};

function webeditorToggleTabs(){
	toggleTabs(".html-editor-area .webeditor-area", ".html-editor-area .codes-area");
};



// 기간 검색시 submit 함수
function buildDateTime(dateStr, hourStr, minStr) {
	if (!dateStr) return null;

	const normalized = dateStr.replace(/\./g, '-');
	const parts = normalized.split('-');
	if (parts.length !== 3) return null;

	const year = parseInt(parts[0], 10);
	const month = parseInt(parts[1], 10);
	const day = parseInt(parts[2], 10);

	let hour = parseInt(hourStr, 10);
	let min = parseInt(minStr, 10);

	if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
	if (isNaN(hour)) hour = 0;
	if (isNaN(min)) min = 0;

	return new Date(year, month - 1, day, hour, min, 0);
}

function validateDateTimeRangeFail(msg, focusId) {
	return {
		ok: false,
		msg: msg,
		focusId: focusId
	};
}

function validateDateTimeRange(cfg) {
	if (!cfg || cfg.enabled === false) {
		return { ok: true };
	}

	const startDateVal = $('#' + cfg.startField.dateId).val();
	const endDateVal = $('#' + cfg.endField.dateId).val();
	const hasStart = !!startDateVal;
	const hasEnd = !!endDateVal;

	if (!hasStart && !hasEnd) {
		if (cfg.required) {
			return validateDateTimeRangeFail(
				cfg.startField.label + '(와/과) ' + cfg.endField.label + '은/는 필수입니다.',
				cfg.startField.dateId
			);
		}
		return { ok: true };
	}

	if (cfg.required) {
		if (!hasStart) {
			return validateDateTimeRangeFail(cfg.startField.label + '를 입력해 주세요.', cfg.startField.dateId);
		}
		if (!hasEnd) {
			return validateDateTimeRangeFail(cfg.endField.label + '를 입력해 주세요.', cfg.endField.dateId);
		}
	}

	if (!cfg.allowSingle) {
		if (hasStart && !hasEnd) {
			return validateDateTimeRangeFail(cfg.endField.label + '를 입력해 주세요.', cfg.endField.dateId);
		}
		if (!hasStart && hasEnd) {
			return validateDateTimeRangeFail(cfg.startField.label + '를 입력해 주세요.', cfg.startField.dateId);
		}
	}

	if (hasStart && hasEnd) {
		const startDt = buildDateTime(
			startDateVal,
			$('#' + cfg.startField.hourId).val(),
			$('#' + cfg.startField.minId).val()
		);
		const endDt = buildDateTime(
			endDateVal,
			$('#' + cfg.endField.hourId).val(),
			$('#' + cfg.endField.minId).val()
		);

		if (!startDt || isNaN(startDt.getTime())) {
			return validateDateTimeRangeFail(cfg.startField.label + ' 형식이 올바르지 않습니다.', cfg.startField.dateId);
		}
		if (!endDt || isNaN(endDt.getTime())) {
			return validateDateTimeRangeFail(cfg.endField.label + ' 형식이 올바르지 않습니다.', cfg.endField.dateId);
		}
		if (cfg.compare !== false && endDt.getTime() < startDt.getTime()) {
			return validateDateTimeRangeFail(
				cfg.endField.label + '은/는 ' + cfg.startField.label + ' 이후이거나 같아야 합니다.',
				cfg.endField.dateId
			);
		}
	}

	return { ok: true };
}

function searchDateRangeAction(e) {
	e.preventDefault();
	if($("#searchStartDt").val() == ""){
		Message.alert({
		 	icon: "warning",
		 	title: "",
		 	message: "검색조건에 시작일을 입력하셔야되요."
		 });
		return false;
	}
	if($("#searchEndDt").val() == ""){
		Message.alert({
		 	icon: "warning",
		 	title: "",
		 	message: "검색조건에 종료일을 입력하셔야되요."
		 });
		return false;
	}

	var startDate = new Date($("#searchStartDt").val().replace(/\./g, "-"));
	var endDate = new Date($("#searchEndDt").val().replace(/\./g, "-"));

	if (startDate > endDate) {

		alert(
			{
			icon: "warning",
			title: "날짜를 확인해 주세요",
			message: "종료일이 시작일보다 먼저이면 안돼요."
			},
			function () {
				return false;
			}
		);
	}else{
		$('.loadingbar').removeClass('hide').addClass('show');
		$(e.target).closest('form').submit();
	}

}

// 페이지 로드시 기간검색 함수
function defaultDateRange(){
	$('#searchDateRange3').trigger('click');
}
