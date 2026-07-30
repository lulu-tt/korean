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
				document.getElementById('addr').value = fullRoadAddr;				//국문 도로명
			}else if(data.userSelectedType =="J" && data.userLanguageType =="K"){
				document.getElementById('addr').value = data.jibunAddress;			//국문 지번
			}else if(data.userSelectedType =="R" && data.userLanguageType =="E"){
				document.getElementById('addr').value = data.roadAddressEnglish;	//영문 도로명
			}else if(data.userSelectedType =="J" && data.userLanguageType =="E"){
				document.getElementById('addr').value = data.jibunAddressEnglish;	//영문 지번
			}else{ //예외처리
				document.getElementById('addr').value = fullRoadAddr;				//국문 도로명
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
	var ServiceSuspend = getneibisCookie(_var);  //

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

