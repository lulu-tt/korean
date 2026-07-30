/**
 * 
 * @param {string} formId - 전송할 엑셀 form id값
 * 
 */
function excelDownActionProc(formId){
	/*개인정보 여부 체크후 '개인정보 다운로드 사유' 입력 모달창 오픈*/
	if(!excelDownPrvcYnChk(formId,null,null)){
		return false;
	}else if($(".prslRsnCn").val()){ /* 개인정보 여부 체크후 '개인정보 다운로드 사유' 값이 존재하면 form 내부에 input값 추가 */
		$("input[name=prslRsnCn]").remove();
		var inputHtml = $("<input type='hidden' name='prslRsnCn'>").val($(".prslRsnCn").val());
		$("#"+formId).append(inputHtml);
		$(".prslRsnCn").val("");
	}
	Message.confirm({
		icon: "warning",
		title: "다운로드를 하시겠어요?",
		message: "다운로드하시려면 ‘확인’을 눌러주세요."
    },function(){
    	let target = $("#"+formId);
    	/*엑셀 다운로드 시 안드로이드 여부 검증 후 처리(제이쿼리 파일다운로드가 안드로이드 미지원)*/
    	if(excelDownAndoirdChk(formId,null,null)){
			return false;
		}
	    $('.loadingbar').removeClass('hide').addClass('show');
		$.fileDownload(target.prop('action'),{
			httpMethod: "POST",
			data:target.serialize(),
			successCallback: function (url) {
			    $('.loadingbar').removeClass('show').addClass('hide');
			},
			failCallback: function (responseHtml, url) {
				$('.loadingbar').removeClass('show').addClass('hide');
				alert("다운로드에 실패했어요.");
				console.log(responseHtml);
				console.log(url);
			}
		});
	});
}

function excelDownActionAjaxProc(requestUrl,menuSn){
	let obj = new Object();
 	obj["menuSn"] = menuSn;
 	
 	/*개인정보 여부 체크후 '개인정보 다운로드 사유' 입력 모달창 오픈*/
	if(!excelDownPrvcYnChk(null,requestUrl,menuSn)){
		return false;
	}else if($(".prslRsnCn").val()){ /*개인정보 여부 체크후 '개인정보 다운로드 사유' 값이 존재하면 object에 추가*/
		obj["prslRsnCn"] = $(".prslRsnCn").val();
		$(".prslRsnCn").val("");
	}
	Message.confirm({
		icon: "warning",
		title: "다운로드를 하시겠어요?",
		message: "다운로드하시려면 ‘확인’을 눌러주세요."
    },function(){
		/*엑셀 다운로드 시 안드로이드 여부 검증 후 처리(제이쿼리 파일다운로드가 안드로이드 미지원)*/
		if(excelDownAndoirdChk(null,requestUrl,menuSn)){
			return false;
		}
	    $('.loadingbar').removeClass('hide').addClass('show');
		$.fileDownload(requestUrl,{
			httpMethod: "POST",
			data: obj,
			successCallback: function (url) {
			    $('.loadingbar').removeClass('show').addClass('hide');
			},
			failCallback: function (responseHtml, url) {
				$('.loadingbar').removeClass('show').addClass('hide');
				alert("다운로드에 실패했어요.");
				console.log(responseHtml);
				console.log(url);
			}
		});
	});
}

/*엑셀 다운로드 시 안드로이드 여부 검증 후 처리(제이쿼리 파일다운로드가 안드로이드 미지원)*/
function excelDownAndoirdChk(formId,requestUrl,menuSn){
	var userAgent = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
	var isAndroid = userAgent.indexOf('android') !== -1 ? true : false;
	if(isAndroid){
		let target;
		if(formId){ /* excelDownActionProc() 함수 실행시 */
			target = $("#"+formId);
			target.attr('target', '_blank'); // 새 창에서 열기 위해 target 속성 설정
			target.submit();
		}else if(requestUrl && menuSn){ /* excelDownActionAjaxProc() 함수 실행시 */ 
			var obj = new Object();
			obj["menuSn"] = menuSn;
			if($(".prslRsnCn").val()){
				obj["prslRsnCn"] = $(".prslRsnCn").val();
			}
			// 동적으로 폼 생성
			target = document.createElement("form");
			target.setAttribute("method", "post");
			target.setAttribute("action", requestUrl);
			target.setAttribute("target"," _blank");
			for(const key in obj) {
		        if (obj.hasOwnProperty(key)) {
		            let input = document.createElement("input");
		            input.type = "hidden";
		            input.name = key;
		            input.value = obj[key];
		            target.appendChild(input);
		        }
		        // 폼을 body에 추가하고 제출
			    document.body.appendChild(target);
			    target.submit();
			    // 폼 제거
			    document.body.removeChild(target);
		    }
		}
	}
	return isAndroid;
}

/*개인정보 여부 체크후 '개인정보 다운로드 사유' 입력 모달창 오픈*/
function excelDownPrvcYnChk(formId,requestUrl,menuSn){
	/*개인정보 여부 사용 체크시 '다운로드 사유' 입력해야 엑셀 다운로드 진행 가능*/
	if($("#excelPrslRsnCnModal").html()){ /* '개인정보 다운로드 사유' 모달창 존재여부 체크 */
		if($("#excelPrslRsnCnModal").hasClass("hide")){ /* '개인정보 다운로드 사유' 모달창이 Close 상태이면 Open */
			$(".prslRsnCn").val("");
			if(formId){ /* excelDownActionProc() 함수 실행시 저장 버튼에 클릭 이벤트 생성 */
				$("#prslRsnCnSaveBtn").attr("onclick", 'excelDownActionProc("'+formId+'")');
			}else if(requestUrl && menuSn){ /* excelDownActionAjaxProc() 함수 실행시 저장 버튼에 클릭 이벤트 생성 */
				$("#prslRsnCnSaveBtn").attr("onclick", "excelDownActionAjaxProc('"+requestUrl+"',"+menuSn+")");
			}
	 		openModal("#excelPrslRsnCnModal");
	 		return false;
		}else if($("#excelPrslRsnCnModal").hasClass("show")){ /* '개인정보 다운로드 사유' 모달창이 Open 상태이면 '다운로드 사유' 항목 유효성 검사 체크 */
			if(!$(".prslRsnCn").val()){
				alert("다운로드 사유를 입력해 주세요.")
				return false;
			}else{
		 		closeModal("#excelPrslRsnCnModal");
			}
		}
	}
	return true;
}
