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
tw_opt.tw_enabled        = 1;
tw_opt.tw_purge_trends   = "";
tw_opt.tw_promo_del      = 1;
tw_opt.tw_opt_count      = 1;
tw_opt.tw_shortcut       = 1;
tw_opt.tw_movement       = 0;
tw_opt.tw_recommend      = 0;
tw_opt.tw_recom_topic    = 0;
tw_opt.tw_explore_rev    = 0;
tw_opt.tw_explore_verify = 0;
tw_opt.tw_fold           = 1;
tw_opt.tw_direct_pass    = 0;
tw_opt.tw_sync_selfkey   = "";
tw_opt.tw_sync_otherkey  = "";
tw_opt.tw_sync_mode      = 0;
tw_opt.tw_ext            = "";
let tw_save_timer        = 0;
let tw_last_load         = 0;

function tw_save(cb) {
	chrome.storage.local.set({"tw_opt": tw_opt}, cb);
}

function tw_shallow_objcmp(a, b) {
	for (let k of Object.keys(a)) {
		if (a[k] != b[k])
			return false;
	}
	return true;
}

function tw_load(cb) {
	try {
		chrome.storage.local.get("tw_opt", async function(res) {
			let is_first = (res.tw_opt === undefined);
			if (!is_first) {
				for (let key in tw_opt) {
					if (key.substr(0, 3) != "tw_")
						continue;
					if (res.tw_opt[key] === undefined)
						res.tw_opt[key] = tw_opt[key]
				}
				tw_opt = res.tw_opt;
			}
			if (!tw_opt.tw_sync_selfkey || !await tw_synckey_verify(tw_opt.tw_sync_selfkey))
				tw_opt.tw_sync_selfkey = await tw_synckey_gen();

			if (tw_opt.tw_sync_otherkey && !await tw_synckey_verify(tw_opt.tw_sync_otherkey))
				tw_opt.tw_sync_otherkey = "";

			tw_save();

			if (cb)
				cb();
		});
	}
	catch(e) {
		console.debug("tw_load exception", e);
	}
}

function tw_ui8ary2bin(ui8ary) {
	return Array.from(ui8ary).map(b => String.fromCharCode(b)).join("");
}

function tw_str2bin(s) {
	return new TextEncoder("utf-8").encode(s);
}

function tw_bin2str(s) {
	return new TextDecoder("utf-8").decode(s);
}

function tw_bin2int(s) {
	let d = 0;
	for (let c of s) {
		d *= 256;
		d += c;
	}
	return d;
}

function tw_b64enc(s, as_bin) {
	let e = as_bin ? s : tw_str2bin(s);
	let b = tw_ui8ary2bin(e);

	return btoa(b);
}

function tw_b64dec(s, as_bin) {
	let b = atob(s);
	let a = Uint8Array.from(b.split("").map(c => c.charCodeAt(0)));

	return as_bin ? a : tw_bin2str(a);
}

function tw_b64round(s) {
	return s.replace(/\//g, "z").replace(/\+/g, "x");
}

function tw_rand_s(len) {
	let raw = (len + 3) / 4 * 3;
	let s = tw_b64enc(crypto.getRandomValues(new Uint8Array(raw)), true);
	return tw_b64round(s).slice(0, len);
}

async function sha256(s) {
	return  new Uint8Array(await crypto.subtle.digest('SHA-256', s));
}

async function aes_key(key, as_raw) {
	let rkey = as_raw ? key : await crypto.subtle.digest('SHA-256', tw_str2bin(key));
	return await crypto.subtle.importKey("raw", rkey, {name:"AES-GCM"}, false, ["encrypt", "decrypt"]);
}

async function aes_enc(key, data, as_raw) {
	let iv = crypto.getRandomValues(new Uint8Array(12));
	let ary = as_raw ? data : tw_str2bin(data);
	let enc = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: iv}, key, ary));

	let ret = new Uint8Array(iv.length + enc.length);
	ret.set(iv, 0);
	ret.set(enc, iv.length);

	return ret;
}

async function aes_dec(key, data, as_raw) {
	let iv  = new Uint8Array(data.slice(0, 12));
	let enc = new Uint8Array(data.slice(12));
	let dec = await crypto.subtle.decrypt({name: "AES-GCM", iv: iv}, key, enc);

	return as_raw ? dec : tw_bin2str(dec);
}

function tw_sync_key() {
	return tw_opt.tw_sync_otherkey ? tw_opt.tw_sync_otherkey : tw_opt.tw_sync_selfkey;
}

async function tw_upload(cb) {
	if (tw_opt.tw_sync_mode == 0)
		return;
	let key = tw_sync_key();
	let id = await tw_synckey2id(key);
	if (!id)
		return;
	let akey = await aes_key(tw_synckey_rawkey(key));
	let data = await aes_enc(akey, tw_opt.tw_purge_trends);
	let tm = (new Date().getTime()).toString();

	let old = $("tw_upd_div");
	if (old && old.parentNode)
		old.parentNode.removeChild(old);

	let body = document.body;
	let hash = await sha256(tw_str2bin(tw_opt.tw_purge_trends));
	let img  = document.createElement("img");
	let div  = document.createElement("div");

	div.style = "max-height:3px; max-width:3px; overflow:hidden";
	div.id = "tw_upd_div";

	img.crossOrigin = "Anonymous";
	img.id = "tw_upd";
	img.src = "https://api.shirouzu.jp/tsr_upd"
		+ "?t=" + tm
		+ "&id=" + id
		+ "&d=" + encodeURIComponent(tw_b64enc(data, true))
		+ "&h=" + encodeURIComponent(tw_b64enc(hash, true))
		+ "&th=" + encodeURIComponent(tw_b64enc(await sha256(tw_str2bin(tm)), true));
	img.onload = function() {
		div.removeChild(img);
		body.removeChild(div);
		console.debug("tw_upload done");
		if (cb)
			cb(id, true);
	};
	body.appendChild(div);
	div.appendChild(img);
}

function tw_get_red(ary) {
	let data = new Uint8Array(ary.length / 4);
	for (let i=0; i < data.length; i++)
		data[i] = ary[i*4];
	return data;
}

let col_val = ":".charCodeAt(0);

function ipdict_size(s, idx) {
	let e = s.indexOf(col_val, idx);
	if (e == -1)
		return null;

	return { v:parseInt(tw_bin2str(s.slice(idx, e)), 16), n:e };
}

function ipdict_unpack_core(s, idx, obj) {
	let e1 = s.indexOf(col_val, idx);
	if (e1 == -1) return 0;
	let e2 = s.indexOf(col_val, e1+1);
	if (e2 == -1) return 0;

	let k  = tw_bin2str(s.slice(idx, e1));
	let sz = parseInt(tw_bin2str(s.slice(e1+1, e2)), 16);
	e2++;
	let v  = s.slice(e2, e2+sz);

	obj[k] = v;
	return e2 + sz + 1;
}

function ipdict_getint(obj, key) {
	return parseInt(tw_bin2str(obj[key]), 16);
}

function ipdict_getstr(obj, key) {
	return tw_bin2str(obj[key]);
}

function ipdict_getbin(obj, key) {
	return obj[key];
}

function ipdict_unpack(s) {
	if (tw_bin2str(s.slice(0, 4)) != "IP2:")
		return null;

	let ret = ipdict_size(s, 4);
	if (!ret)
		return null;

	let end = ret.n + ret.v + 1;
	if (tw_bin2str(s.slice(end, end + 2)) != ":Z")
		return null;

	let obj = {};
	let idx = ret.n+1;

	while (idx < end) {
		let next = ipdict_unpack_core(s, idx, obj);
		if (next == 0)
			return null;
		idx = next;
	}

	return obj;
}

async function tw_download(save_and_notify) {
	if (tw_opt.tw_sync_mode == 0)
		return;

	let key = tw_sync_key();
	let id  = await tw_synckey2id(key);
	if (!key || !id)
		return;

	let old = $("tw_dld_div");
	if (old && old.parentNode) {
		try {
			old.parentNode.removeChild(old);
		}
		catch(e) {
			console.debug("tw_ tw_download already removed1"); 
		}
	}

	let body = document.body;
	let img  = document.createElement("img");
	let div  = document.createElement("div");

	div.style = "max-height:3px; max-width:3px; overflow:hidden";
	div.id = "tw_dld_div";


	img.crossOrigin = "Anonymous";
	img.id = "tw_dld";
	img.src = "https://api.shirouzu.jp/tsr_dld"
		+ "?t=" + new Date().getTime()
		+ "&id=" + id;
	img.onload = async function() {
		let ctx = document.createElement("canvas").getContext("2d");
		ctx.drawImage(img, 0, 0);
		let full_data = tw_get_red(ctx.getImageData(0, 0, img.width, img.height).data);

		let dict = ipdict_unpack(full_data);

		let stat = ipdict_getint(dict, "ST");
		if (stat == 1) {
			let akey  = await aes_key(tw_synckey_rawkey(key));
			let txt   = await aes_dec(akey, ipdict_getbin(dict, "DT"));
			if (txt != tw_opt.tw_purge_trends) {
				tw_opt.tw_purge_trends = txt;
				if (save_and_notify) {
					tw_save();
					tw_send_message_all({ cmd: "load_done", tw_opt: tw_opt });
				}
			}
			console.debug("tw_ tw_download ok", stat, txt.slice(0, 20), ipdict_getint(dict, "AT")); 
		}
		else console.debug("tw_ tw_download NG", stat); 

		try {
			div.removeChild(img);
			body.removeChild(div);
		}
		catch(e) {
			console.debug("tw_ tw_download already removed2"); 
		}
	};
	body.appendChild(div);
	div.appendChild(img);
}

let tw_synckey_len = 16;
let tw_syncsha_len = 3;
let tw_syncid_len  = 16;

async function tw_synckey_gen() {
	let key = tw_rand_s(tw_synckey_len);
	let dec = tw_b64dec(key, true);

	let sha = (await sha256(dec)).slice(0, tw_syncsha_len);
	let sha_s = tw_b64round(tw_b64enc(sha, true));

	// console.debug("tw_synckey_gen", key, dec, sha, sha_s);

	return key + sha_s;
}

async function tw_synckey_rawkey(key) {
	return tw_b64dec(key, true).slice(0, tw_synckey_len);
}

async function tw_synckey2id(key) {
	if (!key || !await tw_synckey_verify(key))
		return null;

	let dec = tw_b64dec(key, true).slice(1); // with sha
	let raw = (await sha256(dec)).slice(0, tw_syncid_len/4*3);
	return tw_b64round(tw_b64enc(raw, true));
}

async function tw_synckey_verify(key) {
	try {
		let dec = tw_b64dec(key, true);
		let raw_len = tw_synckey_len / 4 * 3;
		let d  = dec.slice(0, raw_len);
		let hs = key.slice(tw_synckey_len);

		let calc_h = (await sha256(d)).slice(0, tw_syncsha_len);
		let cs = tw_b64round(tw_b64enc(calc_h, true));

		//console.debug("tw_synckey_verify", hs == cs);
		return hs == cs;
	} catch(e) {
		return false;
	}
}

let tw_ctx_menu = null;

function tw_icon() {
	console.log("tw_icon", tw_opt.tw_enabled);
	chrome.browserAction.setIcon({path: tw_opt.tw_enabled ? "tw16.png" : "tw16-off.png" });
}

function set_tw_badge(tid, btxt) {
	if (chrome.browserAction.setBadgeTextColor) { // for Firefox
		chrome.browserAction.setBadgeBackgroundColor({color: "rgb(80, 135, 243)"});
		chrome.browserAction.setBadgeTextColor({color: "rgb(255, 255, 255)"});
	}
	chrome.browserAction.setBadgeText({tabId: tid, text: btxt});
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
	//console.log("tw_onMessage(background)", msg, msg.tw_opt ? msg.tw_opt.tw_enabled : null);

	if (sender.tab) {
		chrome.tabs.get(sender.tab.id, function(tab) {
			if (chrome.runtime.lastError /*|| !tab.active*/)
				return;

			let cur = new Date().getTime();
			if (msg.cmd == "set_badge") {
				set_tw_badge(sender.tab.id, msg.badgeText);
			}
			else if (msg.cmd == "load") {
				chrome.tabs.sendMessage(sender.tab.id, { cmd: "load_done", tw_opt: tw_opt });
				if (msg.need_dl && tw_save_timer == 0 && (cur - tw_last_load) > 2000) {
					tw_last_load = cur;
					tw_download(true);
				}
			}
			else if (msg.cmd == "load_via_optpage") {
				chrome.tabs.sendMessage(sender.tab.id, { cmd: "load_done", tw_opt: tw_opt });
				if (msg.need_dl && tw_save_timer == 0) {
					tw_last_load = cur;
					tw_download(true);
				}
			}
			else if (msg.cmd == "save") {
				let need_upd = tw_opt.tw_purge_trends != msg.tw_opt.tw_purge_trends;
				let need_dld = (msg.tw_opt.tw_sync_otherkey && msg.tw_opt.tw_sync_mode && !tw_opt.tw_sync_mode)
						|| (msg.tw_opt.tw_sync_mode && msg.tw_opt.tw_sync_otherkey && !tw_opt.tw_sync_otherkey);

				if (!tw_shallow_objcmp(tw_opt, msg.tw_opt)) {
					msg.tw_opt.tw_opt_count++;
					//console.log("tw_opt_count=%d", msg.tw_opt.tw_opt_count);
				}
				tw_opt = msg.tw_opt;
				tw_save();
				tw_icon();

				if (need_upd) {
					if (msg.is_imm)
						tw_upload();
					else {
						tw_save_timer = cur;
						setTimeout(function() {
							if (tw_save_timer == cur) {
								tw_save_timer = 0;
								tw_upload();
							}
						}, 2000);
					}
				}
				else if (need_dld && tw_save_timer == 0 && (cur - tw_last_load) > 2000) {
					tw_last_load = cur;
					tw_download(true);
				}
			}
			else if (msg.cmd == "verify") {
				async function f() {
					let result = await tw_synckey_verify(msg.key);
					chrome.tabs.sendMessage(sender.tab.id, {
						cmd: "verify_done", key: msg.key, result:result });
				};
				f();
			}
			else {
				console.debug("tw_onMessage(background): unknown cmd:", msg.cmd);
			}
			return true;
		});
	}

	return true;
});

function tw_send_message_all(msg) {
	chrome.tabs.query({}, function(tabs) {
		for (let i=0; i < tabs.length; i++)
			chrome.tabs.sendMessage(tabs[i].id, msg);
	});
}

chrome.browserAction.onClicked.addListener(function(tab) {
	console.log("tw_onClicked", tab, tw_opt.tw_enabled);
	tw_create_ctx_menu();

	tw_opt.tw_enabled = !tw_opt.tw_enabled;
	tw_icon();
	tw_save();
	tw_send_message_all({ cmd: "load_done", tw_opt: tw_opt });
});

chrome.tabs.onActivated.addListener(function (tab) {
	//console.log("tw_tabActivated", tab);
	chrome.tabs.sendMessage(tab.tabId, { cmd: "act", msg:"onActivated"});
	tw_create_ctx_menu();
	return true;
});

chrome.tabs.onUpdated.addListener(function (tabId) {
	//console.log("tw_tabUpdated", tabId);
	tw_create_ctx_menu();
	chrome.tabs.get(tabId, function(tab) {
		if (chrome.runtime.lastError /*|| !tab.active*/)
			return;
		chrome.tabs.sendMessage(tabId, { cmd: "act", msg:"onUpdated"});
		return true;
	});

	return true;
});

function tw_option_page() {
	chrome.runtime.openOptionsPage();
}

function tw_create_ctx_menu() {
	if (tw_ctx_menu)
		return;

	console.log("tw_create_ctx_menu begin");
	let arg = {
		id: 'tw-settings',
		title: 'Twitter Stress Reduction',
		documentUrlPatterns: ["https://twitter.com/*"],
		onclick: tw_option_page
	};
	if (!tw_is_firefox)
		arg.documentUrlPatterns.push("chrome://extensions/*");

	chrome.contextMenus.removeAll();
	tw_ctx_menu = chrome.contextMenus.create(arg);
}

chrome.runtime.onInstalled.addListener(function(data) {
	if (data.reason == "install")
		chrome.runtime.openOptionsPage()
	tw_create_ctx_menu();
});

tw_load(tw_icon);

