/* ========================================================================
	Project  Name			: Twitter Stress Reduction
	Create					: 2016-11-25(Fri)
	Update					: 2021-06-05(Sat)
	Copyright				: H.Shirouzu
	License					: GNU General Public License version 3
	======================================================================== */
"use strict";

let $ = function(id) { return document.getElementById(id); }
let tw_is_firefox = typeof InstallTrigger !== 'undefined';
let tw_opt = {};
let tw_load_cb = null;

function tw_load(cb, need_dl) {
	tw_load_cb = cb;
	chrome.runtime.sendMessage({
		cmd: "load_via_optpage",
		need_dl: need_dl ? true : false
	});
}

function tw_save(is_imm) {
	chrome.runtime.sendMessage({
		cmd: "save",
		tw_opt: tw_opt,
		is_imm: is_imm ? true : false
	});
}

function check_item(key) {
	tw_opt[key] = $(key).checked ? 1 : 0;
	tw_save();
}

function check_titem(key) {
	let val = $(key).value;
	if (tw_opt[key] != val) {
		if (key == "tw_purge_trends") {
			if (tw_regex_check_core(val))
				return;
		}
		tw_opt[key] = val;
		tw_save();
	}
}

function init_check_item(key, func) {
	let ele = $(key);
	if (!ele) {
		console.debug("%s not found", key);
		return;
	}
	ele.onclick = func ? func : function() { return check_item(key); };
	ele.checked = tw_opt[key] ? true : false;
}

function init_check_titem(key) {
	$(key).onchange = function() { return check_titem(key); }
	$(key).onkeyup  = function() { return check_titem(key); }
	$(key).value = tw_opt[key];
}

function init_contents() {
	let opt_list = [
		"opt_syncid",
		"desc",
		"opt_desc",
		"opt_enabled",
		"opt_settings",
		"opt_movement",
		"opt_recommend",
		"opt_recom_topic",
		"opt_histlink",
		"opt_history",
		"opt_histtitle",
		"opt_purge_title",
		"opt_purge_example",
		"opt_purge_desc",
		"opt_home",
		"opt_shortcut",
		"opt_explore_rev",
		"opt_explore_verify",
		"opt_fold",
		"opt_direct_pass",
		"opt_promo_del",
		"opt_purge_trends",
		"opt_uidesc",
		"opt_uidesc_contents",
		"opt_sync_btn",
		"opt_synchelp",
		"opt_syncdesc",
		"opt_import",
		"opt_revert",

		"opt_ex_title",

		"opt_ex1_title",
		"opt_ex1_suppl",
		"opt_ex1_desc",

		"opt_ex2_title",
		"opt_ex2_suppl",
		"opt_ex2_desc",

		"opt_ex3_title",
		"opt_ex3_suppl",
		"opt_ex3_desc",

		"opt_debug",
		"opt_gpl"
	];
	for (let key of opt_list) {
		try {
			let n = $(key);
			let v = chrome.i18n.getMessage(key);

			if (!n)
				continue;
			if (n.tagName == "TEXTAREA" || n.tagName == "INPUT")
				n.value = v
			else
				n.innerText = v;
		}
		catch(e) {}
	}
	$("opt_ver").innerText = "ver " + chrome.runtime.getManifest().version;
}

function tw_textarea_fit(node, margin) {
	while (node.scrollHeight <= node.offsetHeight)
		node.style.height = node.offsetHeight -10 + "px";

	let height = Math.min(Math.max(node.scrollHeight + (margin ? 10 : 20), margin ? margin : 50), 10000);
	node.style.height = height + "px";
}

function tw_textarea_fit_all(is_init) {
	let textarea_list = ["tw_purge_trends", "opt_purge_example"];

	for (let key of textarea_list) {
		let node = $(key);
		tw_textarea_fit(node);
		if (is_init && !node.readonly)
			node.oninput = function() { tw_textarea_fit(node); };
	}
}

function tw_regex_check_core(trends) {
	let result = "";

	for (let key of trends) {
		key = key.trim();
		if (key.length <= 2 || key[0] != '?')
			continue;

		try {
			let is_name = (key[1] == '?') ? true : false;
			let r = new RegExp(key.slice(is_name ? 2 : 1));
		}
		catch(e) {
			let r = new RegExp(tw_is_firefox ? "^[^:]+: (.+)(| in regular expression)$" : "[^:]+:[^:]+/: (.+)$")
			let err = e.toString();
			let m = err.match(r);
			if (m && m.length >= 2)
				result += key + " ... err-info: " + m[1] + "\n";
			else
				result += key + " ... err-info: " + err + "\n";
			console.debug("tw_regex_check_core: invalid: ", key, e);
		}
	}
	return result;
}

function tw_regex_check(is_init) {
	let trends = $("tw_purge_trends").value.split("\n");

	let result = tw_regex_check_core(trends);
	let res_node = $("tw_check_result");

	if (!is_init || result || res_node.style.display != "none") {
		res_node.value = result ? result : "OK";
		res_node.style.display = "inherit";
		tw_textarea_fit(res_node, 1);
	}
	return result;
}

function tw_ext_check(is_init) {
	let ext = $("tw_ext").value.trim();
	let res_node = $("tw_ext_result");
	let result = false;
	try {
		if (ext)
			JSON.parse(ext);
	} catch(e) {
		result = e.message;
	}

	if (!is_init || result || res_node.style.display != "none") {
		res_node.value = result ? result : "OK";
		res_node.style.display = "inherit";
	}
	return result;
}

function tw_reflect_synckey() {
	$("tw_sync").style.display = tw_opt.tw_sync_mode ? "block" : "none";
	$("opt_sync_btn").style.display = tw_opt.tw_sync_mode ? "none" : "inline";

	if ($("tw_sync_key").innerText == tw_opt.tw_sync_selfkey) {
		$("opt_revert").style.display = "none";
	}
	else {
		$("opt_revert").style.display = "inline";
	}
}

function tw_sync_key() {
	return tw_opt.tw_sync_otherkey ? tw_opt.tw_sync_otherkey : tw_opt.tw_sync_selfkey;
}

function tw_sync_key_set() {
	$("tw_sync_key").innerText = tw_sync_key();
	tw_reflect_synckey();
}

function tw_init() {
	init_contents();

	let chk_list = [
		"tw_promo_del",
		"tw_shortcut",
		"tw_movement",
		"tw_recommend",
		"tw_recom_topic",
		"tw_explore_rev",
		"tw_explore_verify",
		"tw_fold",
		"tw_direct_pass"
	];

	for (let key of chk_list)
		init_check_item(key);

	init_check_titem("tw_purge_trends");
	init_check_item("tw_enabled", function() {
		tw_opt.tw_enabled = !tw_opt.tw_enabled;
		tw_save();
	});
	init_check_titem("tw_ext");

	$("opt_ver").innerText = "ver " + chrome.runtime.getManifest().version;

	$("tw_close").onclick = function() { window.close(); };
	tw_textarea_fit_all(true);

	$("tw_check").onclick = function() {
		tw_regex_check();
	};
	$("tw_purge_trends").onblur = function() {
		tw_regex_check(true);
	};
	$("tw_ext_btn").onclick = function() {
		tw_ext_check();
	};

	init_check_item("tw_sync_mode", function() {
		check_item("tw_sync_mode");
		tw_sync_key_set();
	});
	$("opt_revert").onclick = function() {
		tw_opt.tw_sync_otherkey = "";
		tw_sync_key_set();
		tw_save();
	};
	$("opt_import").onclick = function() {
		let msg = chrome.i18n.getMessage("opt_sync_prompt");
		let key = window.prompt(msg, "");
		if (key) {
			key = key.trim();
			if (key != tw_opt.tw_sync_selfkey) {
				chrome.runtime.sendMessage({
					cmd: "verify",
					key: key
				});
			}
		}
	};
	$("opt_sync_btn").onclick = function() {
		tw_opt.tw_sync_mode = tw_opt.tw_sync_mode ? 0 : 1
		tw_sync_key_set();
	}
	$("sync_help").onmouseover = function() {
		$("opt_synchelp").style.display = "inline";
	}
	$("sync_help").onmouseout = function() {
		$("opt_synchelp").style.display = "none";
	}
	tw_sync_key_set();

	tw_regex_check(true);
	tw_ext_check(true);
}

window.onload = function() {
	tw_load(tw_init, true);
}

window.onresize = function() {
	tw_textarea_fit_all();
}

chrome.runtime.onMessage.addListener(function(req, sender, res) {
	console.debug("tw_onMessage(option)", req, sender, res);

	if (req.cmd == "load_done") {
		tw_opt = req.tw_opt;
		let cb = tw_load_cb ? tw_load_cb : tw_init;
		tw_load_cb = null;
		cb();
	}
	else if (req.cmd == "act") {
	}
	else if (req.cmd == "verify_done") {
		if (req.result) {
			tw_opt.tw_sync_otherkey = req.key;
			tw_sync_key_set();
			tw_save();
		}
		else {
			alert("Sorry, this SharedKey is incorrect.");
		}
	}
	else {
		console.debug("tw_onMessage(option): unknown cmd:", req.cmd);
	}

	return true;
});

