/**
 *
 */
'use strict'

var NeibisValidWrapper = function(){

	const phoneLen = 11;
	const numberLen = 15;
	const accnoLen = 15;
	const bizrnoLen = 12;
	const corgnoLen = 14;
	const dateLen = 10;
	const telLen = 14;

	var _aply = this;


	_aply.init = function(){
		console.log("NeibisValidWrapper init");
		_aply.tel = ".tel-valid";
		_aply.phone = ".phone-valid";
		_aply.percent = ".percent-valid";
		_aply.number = ".number-valid";
		_aply.numberAndZero = ".numberzero-valid";
		_aply.accno = ".accno-valid";
		_aply.bizrno = ".bizno-valid";
		_aply.corgno = ".corgno-valid";
		_aply.date = ".date-valid";
		_aply.email = ".email-valid";
		_aply.domain = ".domain-valid";

		_aply.actionEvent();
		_aply.readyAction();
	};

	_aply.errorArray = new Array();

	_aply.readyAction = function(){
		if(typeof $(_aply.date).val() !== 'undefined'){
			$.each($(_aply.date),function(){
				$(this).val(_aply.dateWithHyphen($(this).val()));
			});
		}
		if(typeof $( _aply.number).val() !== 'undefined'){
			$.each($(_aply.number),function(){
				$(this).val(_aply.numberWithCommas($(this).val()));
			});
		}

		if(typeof $( _aply.percent).val() !== 'undefined'){
			$.each($(_aply.percent),function(){
				$(this).val(_aply.percentWithCommas($(this).val()));
			});
		}
		if(typeof $(_aply.bizrno).val() !== 'undefined'){
			$.each($(_aply.bizrno),function(){
				$(this).val(_aply.bizrnoWithHyphen($(this).val()));
			});
		}
		if(typeof $(_aply.corgno).val() !== 'undefined'){
			$.each($(_aply.corgno),function(){
				$(this).val(_aply.jurirnoWithHyphen($(this).val()));
			});
		}
	};

	_aply.actionEvent = function(){

		$(document).on("change",_aply.tel,function(e){
			let obj = new Object();
			var chkPhone = /^[0-9]+$/;
			var phoneNb = $(this).val().replace(/-/gi,"");
			if(!chkPhone.test(phoneNb) && phoneNb != ""){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "핸드폰번호 형식이 올바르지 않아요. 다시 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
			}
			$(this).val(_aply.telWithHyphen($(this).val()));
		});

		$(document).on("change",_aply.phone,function(e){
			let obj = new Object();
			var chkPhone = /^[0-9]+$/;
			var phoneNb = $(this).val().replace(/-/gi,"");
			if(phoneNb.length > phoneLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "휴대폰번호는 "+phoneLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}else if(!chkPhone.test(phoneNb) && phoneNb != ""){
				$(this).val("");
			}
			$(this).val(_aply.phoneWithHyphen($(this).val()));
		});

		$(document).on("change",_aply.number,function(e){
			let obj = new Object();

			if($(this).val().length > numberLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "숫자는 "+numberLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				return false;
			}
			var chkNum = /^(0|0?[-]?[1-9]\d*)$/;
			if(!chkNum.test(parseInt(_aply.numberWithOutCommas($(this).val()))) && $(this).val()!=""){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "숫자 정수만 입력할 수 있습니다.";
				_aply.errorMessage(obj);
				return false;
			}
			$(this).val(_aply.numberWithCommas($(this).val()));

		});

		$(document).on("change",_aply.numberAndZero,function(e){
			let obj = new Object();
			if($(this).val().length > numberLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "숫자를 "+numberLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				return false;
			}
			var chkNum = /^(0|0?[-]?[1-9]\d*)$/;
			if(!chkNum.test(parseInt(_aply.numberWithOutCommasAndzero($(this).val()))) && $(this).val()!=""){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "숫자 정수만 입력할 수 있습니다.";
				_aply.errorMessage(obj);
				return false;
			}
			$(this).val(_aply.numberWithCommasAndZero($(this).val()));

		});

		$(document).on("change",_aply.accno,function(e){
			let obj = new Object();
			var chkAcc = /^[0-9]+$/;
			if($(this).val().length > accnoLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "계좌는 "+accnoLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}else if(!chkAcc.test($(this).val()) && $(this).val()!=""){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "계좌는 정수만 입력할 수 있습니다.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}

		});

		$(document).on("change",_aply.percent,function(e){
			let obj = new Object();
			if($(this).val().length > numberLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "숫자를 "+numberLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}
			$(this).val(_aply.percentWithCommas($(this).val()));
		});
		$(document).on("change",_aply.bizrno,function(e){
			let obj = new Object();
			if($(this).val().length > bizrnoLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "사업자등록번호는 "+bizrnoLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}
			$(this).val(_aply.bizrnoWithHyphen($(this).val()));
		});
		$(document).on("change",_aply.corgno,function(e){
			let obj = new Object();
			if($(this).val().length > corgnoLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "법인등록번호는 "+corgnoLen+"자리 이하로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}
			$(this).val(_aply.jurirnoWithHyphen($(this).val()));
		});
		$(document).on("change",_aply.date,function(e){
			let obj = new Object();
			if($(this).val().length > dateLen){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}
			$(this).val(_aply.dateWithHyphen($(this).val()));
		});

		$(document).on("change",_aply.email,function(e){
			let obj = new Object();
			var chkEml = /^[_a-zA-Z0-9-!#$%^&*()@\.]+$/;
			if(!chkEml.test($(this).val()) && $(this).val()!=""){
				if(typeof $($(this).closest("td").html() !== "undefined")){
					obj.target =  $(this).closest("td");
				}else{
					obj.target =  $(this).closest("li");
				}
				obj.message = "이메일형식은 영문, 숫자, 특수문자 ! # $ % ^ & * ( ) - _만 입력가능합니다.";
				_aply.errorMessage(obj);
				$(this).val("");
				return false;
			}
		});

	};

	_aply.saveEvent = function(){
		if(typeof $(_aply.date).val() !== 'undefined'){
			$.each($(_aply.date),function(){
				$(this).val(_aply.dateWithOutHyphen($(this).val()));
			});
		}
		if(typeof $(_aply.phone).val() !== 'undefined'){
			$.each($(_aply.phone),function(){
				$(this).val(_aply.phoneWithOutHyphen($(this).val()));
			});
		}
		if(typeof $(_aply.tel).val() !== 'undefined'){
			$.each($(_aply.tel),function(){
				$(this).val(_aply.telWithOutHyphen($(this).val()));
			});
		}
		if(typeof $(_aply.number).val() !== 'undefined'){
			$.each($(_aply.number),function(){
				$(this).val(_aply.numberWithOutCommas($(this).val()));
			});
		}

		if(typeof $(_aply.number).val() !== 'undefined'){
			$.each($(_aply.numberAndZero),function(){
				$(this).val(_aply.numberWithOutCommasAndzero($(this).val()));
			});
		}

		if(typeof $(_aply.percent).val() !== 'undefined'){
			$.each($(_aply.percent),function(){
				$(this).val(_aply.numberWithOutCommas($(this).val()));
			});
		}

		if(typeof $(_aply.bizrno).val() !== 'undefined'){
			$.each($(_aply.bizrno),function(){
				$(this).val(_aply.numberWithOutHyphen($(this).val()));
			});
		}
		if(typeof $(_aply.corgno).val() !== 'undefined'){
			$.each($(_aply.corgno),function(){
				$(this).val(_aply.numberWithOutHyphen($(this).val()));
			});
		}
	};

	_aply.valid = function(formId){
		var form;
		if(form == ""){
			form = document.querySelector(".content-body").getElementsByTagName("form")[0];
		}else{
			form = document.getElementById(formId);
		}
		var value = new NeibisValidator(form);

		$.each($("#"+form.id).find("input,select,textarea"),function(i,v){
			var defaultText = "";
			if($(this).attr("type") == "hidden" || typeof $(this).data('defualt-message') !== 'undefined'){
				defaultText = $(this).data('defualt-message');
			}else{
				if(typeof $(this).closest("td").html() !== 'undefined'){
					var colNm = $(this).closest("td").prev().find("label:last").text() != ''
									 ? $(this).closest("td").prev().find("label:last").text()
									 : $(this).closest("td").prev().find("span:last").text();
				}else{
					var colNm = $(this).closest("div").prev().text();
				}
				defaultText = colNm.replace("필수입력","").replace(/\t/gi,"").replace(/\n/gi,"");
			}
			var mxLth =  $(this).attr("maxlength");
			var min =  $(this).attr("min");
			var max =  $(this).attr("max");

			if($(this).attr("name") != "__encrypted" && !$(this).hasClass("exclude-validation")){
				var extendOpt = new Object();
					if(typeof mxLth !== "undefined"){
						extendOpt.maxbyte = parseInt(mxLth);
					}
					if(typeof min !== "undefined"){
						extendOpt.min = parseInt(min);
					}
					if(typeof max !== "undefined"){
						extendOpt.max = parseInt(max);
					}
				//if($("label[for ='"+$(this).attr("id")+"']").closest("tr").find(".req").text() != ''){
				if($(this).closest("td").prev().find(".req").text() != '' && $(this).attr("type") != "hidden"){
					if($(this).attr("type") == "password"){
						var matchId = typeof $(this).closest("tr").next().find(":password").attr("id") !== "undefined" ? $(this).closest("tr").next().find(":password").attr("id") :  "";
						if(matchId != "" && $(this).data("match-yn") != "N"){
							extendOpt.match = matchId;
						}
						value.add($(this).attr("id"),$.extend({required:true,option:"password",label:defaultText},extendOpt));
					}else if($(this).attr("id").indexOf("EmlAddr") > -1){
						value.add($(this).attr("id"),$.extend({required:true,option:"email",label:defaultText},extendOpt));
					}else if($(this).attr("id").indexOf("Telno") > -1 ){
						if($(this).attr("id").toLowerCase().indexOf("mbl") > -1){
							value.add($(this).attr("id"),{required:true,option: "handphone",maxbyte:phoneLen,label:defaultText});
						}else{
							value.add($(this).attr("id"),$.extend({required:true,option: "homephone",maxbyte:telLen,label:defaultText},extendOpt));
						}
					}else if($(this).attr("id").indexOf("Fxno") > -1){
						console.log($(this).attr("id"))
						value.add($(this).attr("id"),$.extend({required:true,option: "homephone",maxbyte:telLen,label:defaultText},extendOpt));
					}else{
						value.add($(this).attr("id"),$.extend({required:true,label:defaultText},extendOpt));
					}
				}else{

						if($(this).attr("id") && $(this).attr("id").indexOf("pstCn") > -1){
							if($(this).is(":required")){
								value.add($(this).attr("id"),$.extend({required:true,label:defaultText},extendOpt));
							}
						}
						if($(this).attr("id") && $(this).attr("id").indexOf("EmlAddr") > -1){
							if($(this).val() != ""){
								value.add($(this).attr("id"),$.extend({required:true,option:"email",label:defaultText},extendOpt));
							}
						}else if($(this).attr("id") && $(this).attr("id").indexOf("Telno") > -1 ){
							if($(this).attr("id").toLowerCase().indexOf("mbl") > -1){
								value.add($(this).attr("id"),{option: "handphone",maxbyte:phoneLen,label:defaultText});
							}else{
								value.add($(this).attr("id"),{option: "homephone",maxbyte:telLen,label:defaultText});
							}
						}else if($(this).attr("id") && $(this).attr("id").indexOf("Fxno") > -1){
							value.add($(this).attr("id"),{option: "fax",maxbyte:telLen,label:defaultText});
						}else if($(this).attr("type") == "radio"){
							value.add($(this).attr("id"),$.extend({required:true,mincheck:1,label:defaultText},extendOpt));
						}else if(this.nodeName == "TEXTAREA"){
							if($(this).is(":required")){
								value.add($(this).attr("id"),$.extend({required:true,label:defaultText},extendOpt));
							}
						}else if($(this).attr("type") == "password"){
							if($(this).val() != ""){
							var matchId = typeof $(this).closest("tr").next().find(":password").attr("id") !== "undefined" ? $(this).closest("tr").next().find(":password").attr("id") :  "";
								if(matchId != "" && $(this).data("match-yn") != "N"){
									extendOpt.match = matchId;
								}
								value.add($(this).attr("id"),$.extend({required:true,option:"password",label:defaultText},extendOpt));
							}
						}
				}
			}
		});

		var result = new Object();
		result.result = value.validate();
		result.message = value.getErrorMessage();
		result.element =  value.getErrorElement();

		if(value.validate()){
			_aply.saveEvent();
			result.data =  _aply.paramBindig(form.id);
		}

		return result;
	};

	_aply.paramBindig = function(form){
		var obj = new Object();
		$.each($("#"+form).find("input,select,textarea"),function(i,v){
			let bindNm = typeof $(this).attr("name") !== "undefined" ? $(this).attr("name") : $(this).attr("id");
			if($("#"+form).find("[name="+bindNm+"]").length > 1){

				 if($(this).attr("type") == "radio"){
					obj[bindNm] = $("#"+form).find("[name="+bindNm+"]:checked").val();
				 }else if($(this).attr("type") == "checkbox"){
					var checkboxSn = 0;
					$.each($("#"+form).find("[name="+bindNm+"]:checked"),function(k,j){
						checkboxSn = checkboxSn + parseInt(j.value);
					});
					obj[bindNm] = checkboxSn;
				 }else{
					let bindArr = new Array();
					$.each($("#"+form).find("[name="+bindNm+"]"),function(k,j){
						bindArr.push(j.value);
					});
					obj[bindNm] = bindArr;
				 }
			}else{
			/*if($(this).attr("type") == "password"){
					var rsa = new RSAKey();
	 				rsa.setPublic(document.getElementById("RSAModulus").value,document.getElementById("RSAExponent").value);
	 				obj[bindNm] = rsa.encrypt(v.value);
			*/
//				if($(this).hasClass("inuix-ckeditor")) {
//					obj[bindNm] = CKEDITOR.instances[bindNm].getData();
//				}else {
					obj[bindNm] = v.value;
//				}
			}
		});
		return obj;
	}

	_aply.errorMessage = function(obj){
		var errorMs = $("<span>").addClass("text-guide text-invalid").text(obj.message);
		obj.target.append(errorMs);
	}

	_aply.numberWithCommas = function(x) {
		var pattern = /^(0|[-]?[1-9]\d*)$/;
		if(x == "" || x == null){
			return "";
		}
		x = x.toString().replace(/(^0+)/, "");
		x = x.toString().replace(/,/gi,"");


		if(pattern.test(x)){
		    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}else{
			return "";
		}
	}
	_aply.numberWithCommasAndZero = function(x) {
		var pattern = /^(0|[-]?[1-9]\d*)$/;
		console.log(x);
		if(x == 0 ||x == "" || x == null){
			return "0";
		}
		x = x.toString().replace(/(^0+)/, "");
		x = x.toString().replace(/,/gi,"");


		if(pattern.test(x)){
			return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}else{
			return "";
		}
	}

	_aply.percentWithCommas = function(x) {

		var pattern = /^-?\d+(?:[.]\d{0,2}?)?$/;
		x = x.toString().replace(/,/gi,"");

		if(x == ""){
			return "";
		}

		$("#error-message").remove();
		$.each($(".caution"),function(i){
			if(i > 0){
				$(this).removeClass("caution");
			}
		});

		if(pattern.test(x)){
		    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}else{
			alert("숫자와 소수점은 2자리까지 입력할 수 있습니다.");
			return "";
		}

	}

	_aply.numberWithOutCommas = function(x) {
		return x.toString().replace(/,/gi,"");
	}

	_aply.numberWithOutCommasAndzero = function(x) {
		if(x == 0 || typeof x === 'undefined' || x == ""){
			return 0;
		}
		return x.toString().replace(/,/gi,"");
	}

	_aply.phoneWithHyphen = function(x){
		if(typeof x !== 'undefined'){
			x = x.toString().replace(/-/gi,"");
			return x.toString().replace(/^(01[0-9])-?([1-9]{1}[0-9]{2,3})-?([0-9]{4})$/,"$1-$2-$3");
		}
		return "";
	}
	_aply.phoneWithOutHyphen = function(x){
		return x.toString().replace(/-/gi,"");
	}

	_aply.telWithOutHyphen = function(x){
		return x.toString().replace(/-/gi,"");
	}


	_aply.telWithHyphen = function(x){
		if(typeof x !== 'undefined'){
			x = x.toString().replace(/-/gi,"");
			if(x.length == 8 || x.length == 7){
//				return x.toString().replace(/^(1544|1566|1577|1588|1644|1688)-?([0-9]{4})$/,"$1-$2");
				return x.toString().replace(/^([0-9]{3,4})-?([0-9]{4})$/,"$1-$2");
			/*}else if(x.length == 7){
				return x.toString().replace(/^([0-9]{3,4})-?([0-9]{4})$/,"$1-$2");*/
			}else{
				if(x.substr(0,2) == "02"){
					return x.toString().replace(/^(0[2-8][0-5]?)-?([1-9]{1}[0-9]{3})-?([0-9]{4})$/,"$1-$2-$3");
				}else{
					return x.toString().replace(/^(0[2-8][0-5]?)-?([1-9]{1}[0-9]{2})-?([0-9]{4})$/,"$1-$2-$3");
				}

			}
		}
		return "";
	}

	_aply.bizrnoWithHyphen = function(x){
		if(typeof x !== 'undefined'){
			x = x.toString().replace(/-/gi,"");
			return x.toString().replace(/^([0-9]{3})-?([0-9]{2})-?([0-9]{5})$/,"$1-$2-$3");
		}
		return "";
	}

	_aply.jurirnoWithHyphen = function(x){
		if(typeof x !== 'undefined'){
			x = x.toString().replace(/-/gi,"");
			return x.toString().replace(/^([0-9]{6})-?([0-9]{7})$/,"$1-$2");
		}
		return "";
	}

	_aply.numberWithOutHyphen = function(x) {
		return x.toString().replace(/-/gi,"");
	}

	_aply.dateWithHyphen = function(x){
		var matchingDate =  /^[12][0-9]{3}\-[01]?[0-9]\-[0-3]?[0-9]$/;
		if(typeof x !== 'undefined'){
			x = x.toString().replace(/[\-|\.|\/|\s]/gi,"");
			var val = x.toString().replace(/^([0-9]{4})-?([0-9]{2})-?([0-9]{2})$/,"$1-$2-$3");
			if(matchingDate.test(val)){
				return val;
			}else{
				return "";
			}
		}
		return "";
	}

	_aply.dateWithOutHyphen = function(x) {
		var val = x.toString().replace(/-/gi,"");
		return val;
	}

};