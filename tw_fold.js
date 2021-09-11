/* ========================================================================
	Project  Name			: Twitter Stress Reduction
	Create					: 2016-11-25(Fri)
	Update					: 2021-09-10(Fri)
	Copyright				: H.Shirouzu
	License					: GNU General Public License version 3
	======================================================================== */
"use strict";

let $ = function(id) { return document.getElementById(id); }
let tw_is_firefox = typeof InstallTrigger !== 'undefined';
let tw_is_mobile = window.matchMedia("(min-width: 500px)").matches ? false : true;
let tw_mob = { init:0 };
let tw_is_dark = window.matchMedia('(prefers-color-scheme: dark)').matches ? true : false;
let tw_opt = {};

let tw_dbg = 0;

let tw_opt_count_key = "twf_cnt_";
let tw_purge_func = null;

let tw_purge_count = 0;
let tw_guard = 0;
let tw_guard_next = 0;
let tw_cur_url = "";

let tw_ignore_val   = 1;
let tw_maxname_len = 300;

let tw_badge_mode = { disable:1, reset:2, add:4 };

let twf_prefix = "twf_";
let twi_prefix = "twi_";
let tw_foldset_label = "✕";
let tw_foldunset_label = "〇";
let tw_menu_label = "☰";
let tw_height = "15px";
let tw_card_height = "20px";
let tw_pictlist_set = null;

let tw_load_cb = null;

function tw_load(cb, need_dl) {
	tw_load_cb = cb;
	chrome.runtime.sendMessage({
		cmd: "load",
		need_dl: need_dl ? true : false
	});
}

function tw_set_twf(e, suffix) {
	e.setAttribute(tw_opt_count_key + suffix, tw_opt.tw_opt_count);
}

function tw_unset_twf(e, suffix) {
	e.setAttribute(tw_opt_count_key + suffix, 0);
}

function tw_gen_ign(suffix) {
	return ":not([" + tw_opt_count_key + suffix + "='" + tw_opt.tw_opt_count + "'])";
}

function tw_str2reg(key) {
	let spec_chars = "\\$.|?*+()[]{}";
	let rkey = "";

	for (let c of key) {
		if (spec_chars.indexOf(c) >= 0)
			rkey += "\\";
		rkey += c;
	}
	return rkey;
}

function tw_par_count(rkey) {
	let cnt = 0;
	let is_esc = false;
	let is_class = false;

	for (let c of rkey) {
		if (is_esc)
			is_esc = false;
		else if (c == '\\')
			is_esc = true;
		else if (is_class) {
			if (c == ']')
				is_class = false;
		} else if (c == '[')
			is_class = true;
		else if (c == '(')
			cnt++;
	}
	return cnt;
}

function tw_gen_regex(purge_trends) {
	let name_reg = {rkey:[], key:[], info:{0:"(none)"}, next_idx:0};
	let tag_reg  = {rkey:[], key:[], info:{0:"(none)"}, next_idx:0};

	for (let key of purge_trends.split("\n")) {
		key = key.trim();
		if (key.length <= 2)
			continue;

		let rkey = null;
		let is_name = false;
		let par_cnt = 1;

		if (key[0] == '?') {
			if (key[1] == '?')
				is_name = true;
			rkey = key.slice(is_name ? 2 : 1);
			try {
				new RegExp(rkey); // test compile
			}
			catch(e) {
				console.debug("tw_regex: invalid: %s", key);
				continue;
			}
			par_cnt += tw_par_count(rkey);
		}
		else
			rkey = tw_str2reg(key);

		let targ = is_name ? name_reg : tag_reg;

		targ.rkey.push(rkey);
		targ.key.push(key);
		targ.info[targ.next_idx] = key;
		targ.next_idx += par_cnt;
	}

	let ret = [];

	for (let reg of [name_reg, tag_reg]) {
		if (reg.rkey.length == 0)
			continue;

		ret.push({
			r:       new RegExp("(" + reg.rkey.join(")|(") + ")"),
			key:     reg.key,
			info:    reg.info,
			is_name: reg == name_reg
		});
	}
	return ret;
}

function tw_match_idx(match_obj) {
	for (let i=1; i < match_obj.length; i++) {
		if (match_obj[i])
			return i-1;
	}
	return 0;
}

function tw_update_purge_func(purge_trends) {
	let match_funcs = [];

	for (let r of tw_gen_regex(purge_trends)) {
		match_funcs.push(function(ele, str, as_label) {
			//if (str.indexOf("ARM") >= 0)
			//	console.debug("tw_ arm");

			if ((as_label && !r.is_name) || str.length >= tw_maxname_len || str.length == 0)
				return null;

			let m = r.r.exec(str);
			if (!m || !m[0])
				return null;

			let idx = tw_match_idx(m);
			// console.log("tw_update_purge_func key:", idx, r.info[idx], r, m);
			let targ = tw_get_trend_node(ele, false, r.is_name);
			if (!targ)
				return { node:null, key:r.info[idx], m:m[0], is_cardwrap:false, is_tweet: false };

			if (targ.is_tweet && !r.is_name)
				return null;
			return { node:targ.node, key:r.info[idx], m:m[0], is_cardwrap:targ.is_cardwrap, is_tweet: targ.is_tweet };
		});
	}
	return function(ele, str, as_label) {
		for (let func of match_funcs) {
			let ret = func(ele, str, as_label);
			if (ret)
				return ret;
		}
		return null;
	};
}

function tw_get_trend_node(ele, is_strict, is_name) {
	//tw_dbg = 1;
	if (tw_dbg)
		console.debug("tw_get_trend_node:", ele);

	if (is_strict) {
		if (!(ele = ele.parentNode) || ele.tagName != "SPAN")
			return null;
		if (!(ele = ele.parentNode) || ele.tagName != "DIV" || ele.getAttribute("dir") != "auto")
			return null;
	}

	let is_card = false;
	let targ = null;
	let targ_p0 = null;
	let targ_p1 = null;
	let targ_p2 = null;
	let is_tweet = false;
	let is_promo = tw_promo_svg_check(ele);

	for (let i=ele; i && i.parentNode; i=i.parentNode) {
		let test_id = i.getAttribute("data-testid");

		if (test_id == "primaryColumn" ||
			test_id == "videoPlayer" ||
			(!is_name && test_id == "tweet" && !is_promo))
			return null;

		if (test_id == "promotedIndicator")
			is_promo = true;

		if (test_id == "UserCell" && !targ) {
			targ = i;
			// is_tweet = true; // ?? にのみ引っ掛かるよう、偽装
		}

		if (!is_tweet && i.tagName == "ARTICLE" && !is_promo)
			is_tweet = true;

		if (!is_card && tw_radius_node(i)) {
			is_card = true;
			targ = i;
		}
		if (tw_is_entrylist_top(i)) {
			if (!targ)
				targ = targ_p0;
			if (tw_dbg)
				console.debug("tw_get_trend_node: is_card=%s", targ, is_card);
			return { node:targ, is_cardwrap:is_card, is_tweet:is_tweet };
		}
		if (!targ) {
			targ_p0 = targ_p1;
			targ_p1 = targ_p2;
			targ_p2 = i;
		}
	}
	return null;
}

function tw_promo_svg_check(ele) {
	if (!ele.parentNode || !ele.parentNode.parentNode)
		return false;

	let ppr = ele.parentNode.parentNode;
	if (ppr.childNodes.length != 2)
		return false;

	let node = ppr.firstChild;
	let tag = node ? node.tagName : null;
	if (!tag)
		return false;

	return tag.toUpperCase() == "SVG";
}

function tw_toobig_node(rc) {
	return rc.width * 1.3 >= window.innerWidth && rc.height * 1.3 >= window.innerHeight;
}

function tw_radius_node(node) {
	if (node.tagName != "DIV")
		return false;

	let style = getComputedStyle(node);
	let ret =	parseInt(style.borderTopLeftRadius)  >= 10 &&
				parseInt(style.borderTopRightRadius) >= 10;

	return ret;
}

function tw_is_entrylist_top(node) {
	let label = node.getAttribute("aria-label");
	if (!label)
		return false;

	return (label.indexOf("タイムライン: ") == 0 && label.indexOf("タイムライン: メッセージ") != 0)
		 || (label.indexOf("Timeline: ") == 0 && label.indexOf("Timeline: Messages") != 0)
		 || label == "おすすめユーザー" || label == "Who to follow"
		 || label == "関連性の高いアカウント" || label == "Relevant people";
}

function tw_set_badge(mode) {
	if (mode & tw_badge_mode.reset)
		tw_purge_count = 0;
	else if (mode & tw_badge_mode.add)
		tw_purge_count++;

	try {
		chrome.runtime.sendMessage({
			cmd: "set_badge",
			badgeText: tw_purge_count == 0 ? "" : tw_purge_count >= 99 ? "99+" : String(tw_purge_count),
			is_enable: (mode & tw_badge_mode.disable) ? false : true
		});
	}
	catch (e) {
		console.log("tw_set_badge can't send", e);
	}
}

function tw_set_hide(info) {
	let node = info.node;
	if (node.style.display == "none" || node.style.overflow == "hidden" || node.style.height == tw_card_height)
		return;

	tw_set_badge(tw_badge_mode.add);

	if (info.is_cardwrap) {
		node.style.height = tw_card_height;
		node.style.minHeight = tw_card_height;
		for (let e of node.childNodes) {
			e.style.height = tw_card_height;
			e.style.opacity = 0;
		}
	}
	else
		node.style.display = "none";

	console.log("tw_set_hide: %s : %s", info.m, info.key, {detail:{intxt: node.innerText, node: node}});
}

function tw_get_text(e) {
	if (!e || !e.firstChild)
		return null;
	return e.firstChild.nodeValue;
}

function tw_is_direct_self_tweet(ret) {
	if (!ret.is_tweet || ret.is_cardwrap)
		return false;

	let url = tw_get_tweet_url(ret.node, false);
	return url && tw_cur_url.indexOf(url) == 0;
}

function tw_promo_check() {
	let err_cnt = 0;
	let ign_key = "promo";
	let ign_str = tw_gen_ign(ign_key);
	let is_direct = tw_cur_url.indexOf("/status/") > 0;

	for (let e of document.querySelectorAll("span" + ign_str + ",a[dir='ltr']" + ign_str)) {
		try {
			tw_set_twf(e, ign_key);

			let intxt = tw_get_text(e);
			if (!intxt)
				continue;

			if (tw_opt.tw_promo_del) {
				if (intxt == "プロモーション" || intxt == "Promoted") {
					let p = tw_get_trend_node(e, false, true);
					if (p) {
						let n = p.node;
						if (n.style.display != "none") {
							n.style.display = "none";
							for (let sn of [n.parentNode.previousSibling, n.parentNode.nextSibling])
								if (sn && !sn.innerText)
									sn.firstChild.style.display = "none";
							console.log("tw_promo_check", n.innerText.slice(0, 30).replace(/\n/g, " "));
						}
						continue;
					}
				}
			}
			if (tw_opt.tw_purge_trends) {
				let ret = tw_purge_func(e, intxt, false);
				if (ret && ret.node) {
					if (!is_direct || !tw_opt.tw_direct_pass || !tw_is_direct_self_tweet(ret))
						tw_set_hide(ret);
				}
			}
		}
		catch(e) {
			console.log("tw_err", e);
			if (err_cnt++ > 10)
				return;
		}
	}

	for (let e of document.querySelectorAll("div[aria-label]" + ign_str + ",img[alt]" + ign_str)) {
		try {
			tw_set_twf(e, ign_key);

			if (!tw_opt.tw_purge_trends)
				continue;
			let is_img = e.tagName == "IMG";
			let val = e.getAttribute(is_img ? "alt" : "aria-label");
			if (!val || is_img && (val == "画像" || val == "Image"))
				continue;

			if (val && tw_opt.tw_purge_trends) {
				let ret = tw_purge_func(e, val, true);
				if (ret && ret.node) {
					if (!is_direct || !tw_opt.tw_direct_pass || !tw_is_direct_self_tweet(ret))
						tw_set_hide(ret);
				}
			}
		}
		catch(e) {
			console.log("tw_lable_err", e);
			if (err_cnt++ > 10)
				return;
		}
	}
}

function tw_fold_footer(e) {
	let v = e.querySelector("div[aria-label][role='group']");
	if (!v) {
		v = e.querySelector("div[role='group']");
	}
	if (!v) {
		console.debug("tw_fold_footer: not found", e);
	}
	return v;
}

function tw_is_set(gallery) {
	return (gallery.style.height == tw_height && gallery.style.overflow == "hidden") ? true : false;
}

function tw_fold_act_core(gallery, is_set) {
	if (!gallery)
		return;
	gallery.style.height = is_set ? tw_height : "";
	gallery.style.overflow = is_set ? "hidden" : "";
	return false;
}

function tw_fold_act(e, btn, gallery, is_set) {
	tw_fold_act_core(gallery, is_set);
	if (btn)
		btn.innerText = is_set ? tw_foldset_label : tw_foldunset_label;
}

function tw_fold_key(twid) {
	if (!twid) return "";
	return	twf_prefix + twid;
}

function tw_fold_img_key(src) {
	if (!src) return "";
	return	twi_prefix + src;
}

function tw_fold_getval(src, tw_id, is_explore) {
	let src_key = tw_fold_img_key(get_image_id(src));
	let tw_id_key = tw_fold_key(tw_id);

	let val = localStorage.getItem(src_key) ? true : false;

	if (tw_id_key) {
		if (!val && localStorage.getItem(tw_id_key)) {
			localStorage.setItem(src_key, "1");
			val = true;
		}
		localStorage.removeItem(tw_id_key);
	}

	return (is_explore && tw_opt.tw_explore_rev) ? !val : val;
}

function tw_fold_setval(src, tw_id, is_explore, val) {
	let src_key = tw_fold_img_key(get_image_id(src));
	let tw_id_key = tw_fold_key(tw_id);

	if (tw_id_key)
		localStorage.removeItem(tw_id_key);

	if (is_explore && tw_opt.tw_explore_rev)
		val = !val;

	if (val)
		localStorage.setItem(src_key, "1");
	else
		localStorage.removeItem(src_key);

	return true;
}

function tw_fold_click(e, btn, gallery) {
	let val = !tw_fold_getval(btn.src, btn.tw_id, btn.is_explore);

	tw_fold_setval(btn.src, btn.tw_id, btn.is_explore, val);

	tw_fold_act(e, btn, gallery, val);

	setTimeout(function() { tw_fold_check(true); }, 0);

	return false;
}

function tw_mkfold(menu, parent, gallery, tw_id, src, is_inner, is_set, is_explore) {
	let c = document.createElement("div");
	c.innerText = is_set ? tw_foldset_label : tw_foldunset_label;
	c.className = "css-1dbjc4n r-1mlwlqe r-18u37iz r-18kxxzh r-1h0z5md";
	c.tw_id = tw_id;
	c.setAttribute("tw_btn_id", tw_id);
	c.src = src;
	c.gallery = gallery;
	c.is_explore = is_explore;

	let bg = tw_is_dark ? "black" : "white";
	if (is_explore) {
		c.style = "height:16px; width:16px; position:absolute; right:0px; font-size:60%; text-color:rgba(10,10,10,0.3); text-shadow:2px 2px 0 rgba(220,220,220,.5); background-color: transparent;"
	}
	else {
		c.className = menu.lastChild.className;
		c.style = "padding:10px; border-radius: 15px; color:grey;" + (tw_is_mobile ? "" : is_inner ? "top:2px; right:0px;" : "top:0px; right:-60px;");

		if (!tw_is_mobile) {
			c.onmouseover=function() { c.style.backgroundColor= tw_is_dark ? '#777' : '#ddd'; };
			c.onmouseout =function() { c.style.backgroundColor = "transparent"; };
		}
	}
	c.onclick = function(e) {
		tw_fold_click(parent, c, gallery);
		e.stopPropagation();
		return false;
	}
	menu.appendChild(c);
}

function tw_get_tweet_url(node, with_label) {
	let alist = node.querySelectorAll(with_label ? "a[aria-label][role='link']" : "a[role='link']");
	for (let a of alist) {
		let idx = a.href.indexOf("/status/");
		if (idx < 0)
			continue;
		if (with_label || a.href.slice(idx + 8).indexOf("/") < 0) // /status/xxx/photo等で無い
			return a.href;
	}
	return null;
}

function get_tweet_info(ele, is_promo, img) {
	let ar  = null;
	let tw_id  = null;
	let list_header = null;
	let inner = false;

	let dbg = 0;
	if (dbg) console.debug("tw_get_tweet_info1:", ele, is_promo, img);

	for (let i=ele; i && i.parentNode; i=i.parentNode) {
		if (ar) {
			if (!i.className) {
				return {tw_id:tw_id, tw:i, inner:inner, alt:null};
			}
		} else if (i.tagName == 'ARTICLE') {
			ar = i;
			if (is_promo) continue;

			let url = tw_get_tweet_url(ar, true);
			let targ_url = url ? url : tw_cur_url;
			inner = true;

			if (!url) {
				let da_list = ar.querySelectorAll("div[data-testid]");
				for (let da of da_list) {
					if ((url = tw_get_tweet_url(da, true))) {
						targ_url = url;
						inner = false;
						break;
					}
				}
			}
			let idx = targ_url.indexOf("/status/");
			if (idx > 0) {
				tw_id = targ_url.slice(idx + 8);
			}
			if (!tw_id) {
				if (dbg) console.debug("tw_none: ", ar, da, targ_url);
				return null;
			}
		} else if (list_header) {
			if (!i.className) {
				return {tw_id:0, tw:i, inner:inner, alt:null}; // list header
			}
		} else if (i.className == "css-1dbjc4n r-1adg3ll r-1udh08x") {
			list_header = i;
		}
	}
	if (!ar && list_header) {
		return {tw_id:0, tw:list_header, inner:null, alt:null};
	}
	return null;
}

let tw_video_class_list = [
	"css-1dbjc4n r-9x6qib r-t23y2h r-1phboty r-rs99b7 r-psjefw r-1udh08x",
	"css-1dbjc4n r-1bs4hfb r-1867qdf r-1phboty r-rs99b7 r-156q2ks r-1ny4l3l r-1udh08x",
	"css-1dbjc4n r-1bs4hfb r-1867qdf r-1phboty r-rs99b7 r-psjefw r-1ny4l3l r-1udh08x",
	"css-1dbjc4n r-9x6qib r-1ylenci r-1phboty r-rs99b7 r-psjefw r-1udh08x",
	"css-1dbjc4n r-1g94qm0",
	"css-1dbjc4n r-1udh08x"
];

let tw_img_class_list = [
	"css-1dbjc4n r-psjefw",
	"css-4rbku5 css-18t94o4 css-1dbjc4n r-1loqt21 r-1pi2tsx r-1ny4l3l r-1udh08x r-o7ynqc r-6416eg r-13qz1uu",
	"css-1dbjc4n r-1g94qm0",
	"css-1dbjc4n r-1adg3ll r-1udh08x",
	"css-1dbjc4n r-uvzvve r-pm2fo r-zmljjp r-rull8r r-qklmqi r-1adg3ll"
];

function get_gallery_node(img, is_video) {
	let targ_class_list = is_video ? tw_video_class_list : tw_img_class_list;
	let height = img.clientHeight;
	let candidate = null;

	for (let n=img; n && n.parentNode; n=n.parentNode) {
		if (targ_class_list.includes(n.className))
			return n;

		if (tw_is_set(n))
			return n;

		if (!candidate && (n.parentNode.clientHeight - height) > 50)
			candidate = n;

//		if (n.tagName == "DIV" && tw_radius_node(n))
//			return n.firstChild;
	}
	return candidate;
}

function get_explore_node(img) {
	for (let n=img; n && n.parentNode; n=n.parentNode)
		if (n.getAttribute("data-testid") == "eventHero")
			return n;
	return null;
}

let img_src_list = ["/media/", "/card_img/", "/semantic_core_img/", "/pu/img/", "/ad_img/", "/tweet_video/", ""];

function get_image_id(node_src) {
	for (let img_src of img_src_list) {
		let idx = img_src ? node_src.indexOf(img_src) : node_src.lastIndexOf("/");
		if (idx >= 0) {
			let src = node_src.slice(img_src.length + idx)
			let last_idx = src.indexOf("?");

			if (last_idx < 0)
				last_idx = src.indexOf("/")

			return (last_idx > 0) ? src.slice(0, last_idx) : src;
		}
	}

	return 0;
}

function get_image_info(node, is_video) {
	let dbg = 0;
	if (dbg)
		console.debug("tw_get_image_info:", node, is_video);

	let is_explore = tw_cur_url.indexOf("/explore") >= 0 ? true : false;

	let rc = node.getBoundingClientRect();
	if (rc.width < (is_explore ? 300 : 120))
		return null;

	if (!is_video) {
		let found = false;
		for (let img_src of img_src_list) {
			if (node.src.indexOf(img_src) >= 0) {
				found = true;
				break;
			}
		}
		if (!found) {
			if (dbg) console.debug("tw_none 1");
			return null;
		}
	}

	let gal_node = is_explore ? get_explore_node(node) : get_gallery_node(node, is_video);
	if (is_explore && !gal_node) {
		gal_node = get_gallery_node(node, is_video);
		is_explore = false;
	}

	if (!gal_node) {
		if (dbg) console.debug("tw_none 2");
		return null;
	}

	if (is_explore) {
		let tw_id = get_image_id(node.src);
		if (!tw_id)
			return null;
		return {tw_id:tw_id, tw:gal_node, gallery:gal_node, inner:false, is_explore:is_explore, src:node.src};
	}

	let tw_info = get_tweet_info(gal_node, false, node);
	if (!tw_info || !tw_info.tw_id) {
		if (tw_cur_url.indexOf("/lists/") >= 0) {
			let rc = node.getBoundingClientRect();
			if (tw_info && rc.height > 120 && rc.width > 120)
				gal_node.style.height = "10px";
			else if (dbg)
				console.debug("tw_none 3", tw_info);
		}
		return null;
	}
	if (gal_node.className == "css-1dbjc4n r-1adg3ll r-1udh08x")
		gal_node = gal_node.parentNode; // 一つ親にしないと真ん中で fold される場合

	tw_info.gallery = gal_node;
	tw_info.is_explore = is_explore;
	tw_info.src = is_video && node.poster ? node.poster : node.src;

	return tw_info;
}

function get_imgnode_list(need_unset_check) {
	let ans = [];
	let gal_dict = {};
	let ign_key = need_unset_check ? "" : "imgnode";
	let ign_str = need_unset_check ? "" : tw_gen_ign(ign_key);

	for (let e of document.querySelectorAll("img" + ign_str + ",video" + ign_str)) {
		if (ign_key)
			tw_set_twf(e, ign_key);
		let is_video = e.tagName == "VIDEO";
		let info = get_image_info(e, is_video);

		if (info && (!info.tw_id || !gal_dict[info.tw_id])) {
			if (info.tw_id)
				gal_dict[info.tw_id] = 1;
			ans.push(info);
		}
	}
	//console.debug("tw_get_imgnode_list: ", ans);

	return ans;
}

function tw_fold_check(need_unset_check) {
	if (!tw_opt.tw_fold)
		return;

	let	ilist = get_imgnode_list(need_unset_check);

	for (let info of ilist) {
		let btn = null;
		let is_set = tw_fold_getval(info.src, info.tw_id, info.is_explore);

		if (need_unset_check) {
			let q = 'div[tw_btn_id="' + info.tw_id + '"]';
			btn = document.querySelector(q);
		}
		if (is_set || need_unset_check)
			tw_fold_act(info.tw, btn, info.gallery, is_set);

		let f = info.is_explore ? info.tw : tw_fold_footer(info.tw);
		if (!f || !f.lastChild)
			continue;

		let intxt = tw_get_text(f.lastChild);
		if (intxt == tw_foldset_label || intxt == tw_foldunset_label)
			continue;

		tw_mkfold(f, info.tw, info.gallery, info.tw_id, info.src, info.inner, is_set, info.is_explore);
	}
}

function tw_movement() {
	let ign_key = "move";
	let ign_str = tw_gen_ign(ign_key);
	let node = document.querySelector(
			"div[aria-label='タイムライン: トレンド']" + ign_str + "," +
			"div[aria-label='Timeline: Trending now']" + ign_str);

	if (node) {
		tw_set_twf(node, ign_key);

		if (node.style.display != "none") {
			node.style.display = "none";
			//console.log("tw_filter: hide movement");
		}
	}
}

function tw_recommend() {
	let ign_key = "recom";
	let ign_str = tw_gen_ign(ign_key);
	let node = document.querySelector(
			"aside[aria-label='おすすめユーザー']" + ign_str + "," +
			"aside[aria-label='Who to follow']" + ign_str);

	if (node) {
		tw_set_twf(node, ign_key);

		if (node.style.display != "none") {
			let parent_rc = node.parentNode.getBoundingClientRect();
			if (!tw_toobig_node(parent_rc))
				node.parentNode.style.display = "none";

			node.style.display = "none";
			//console.log("tw_filter: hide recommed");
		}
	}
}

function tw_recommend_timeline() {
	let ign_key = "recomTL";
	let ign_str = tw_gen_ign(ign_key);
	let top_node = document.body.querySelector(
						"div[aria-label^='タイムライン: ']," +
						"div[aria-label^='Timeline: ']");

	if (!top_node)
		top_node = document.body;

	for (let node of top_node.querySelectorAll("h2[role='heading']" + ign_str)) {
		tw_set_twf(node, ign_key);
		let kind = node.innerText;

		if (tw_opt.tw_recommend && (kind == "おすすめユーザー" || kind == "Who to follow") ||
			tw_opt.tw_recom_topic && (kind == "おすすめトピック" || kind == "Topics to follow")) {
		}
		else continue;

		let targ = node.parentNode;
		if (targ) targ = targ.parentNode;
		if (targ) targ = targ.parentNode;
		if (!targ || !targ.previousSibling || !targ.nextSibling) {
			if (targ) // 未完了なだけの場合
				tw_unset_twf(node, ign_key);
			continue;
		}
		let set_hide = targ.previousSibling.innerText ? [targ] : [targ.previousSibling, targ];
		let find_end = false;
		for (let n=targ.nextSibling; n; n=n.nextSibling) {
			let txt = n.innerText;
			set_hide.push(n);
			if (set_hide.length >= 10 || find_end)
				break;

			if (txt == "さらに表示" || txt == "その他のトピック" ||
				txt == "Show more"  || txt == "More Topics")
				find_end = true;
		}
		if (find_end) {
			for (let n of set_hide)
				n.firstChild.style.display = "none";
			console.log("tw_hide_topic/user_in_TL: %s", kind);
		}
		else
			tw_unset_twf(node, ign_key);
	}
}

function tw_recom_topic() {
	let ign_key = "topic";
	let ign_str = tw_gen_ign(ign_key);
	let nodes = document.querySelectorAll("section[aria-labelledby*='accessible-list']" + ign_str);

	for (let node of nodes) {
		tw_set_twf(node, ign_key);

		let rc = node.getBoundingClientRect();
		if (rc.left < window.innerWidth / 2)
			continue;
		let label = node.childNodes.length >= 2 ? node.childNodes[1].getAttribute("aria-label") : null;
		if (label == "タイムライン: メッセージ" || label == "Timeline: Messages")
			continue;

		let span = node.querySelector("span");
		if (span && span.firstChild) {
			let intxt = tw_get_text(span);
			if (intxt != "おすすめトピック" && intxt != "Topics to follow")
				continue;
		}
		if (!node || node.style.display == "none")
			continue;

		node.style.display = "none";
		//console.log("tw_filter: hide recommed topic");
		break;
	}
}


function tw_explore_verify() {
	let top_node = document.body;

	if (tw_cur_url.indexOf("twitter.com/explore") < 0) {
		top_node = top_node.querySelector(
						"div[aria-label='タイムライン: トレンド']," +
						"div[aria-label='Timeline: Trending now']");
		if (!top_node)
			return;
	}

//	let url_kinds = ["for-you", "/explore/tabs/trending", "/explore/tabs/news_unified", "explore/tabs/sports_unified", "/explore/tabs/entertainment_unified"];
//	for (let kind of url_kinds) {
//		if (tw_cur_url.indexOf("/explore/tabs/" + kind) > 0) {
//			is_explorer = true;
//			break;
//		}
//	}
	let err_cnt = 0;
	let ign_key = "verify";
	let ign_str = tw_gen_ign(ign_key);

	for (let e of top_node.querySelectorAll(
		"svg[aria-label='認証済みアカウント']" + ign_str + "," +
		"svg[aria-label='Verified account']" + ign_str)) {
		try {
			tw_set_twf(e, ign_key);
			let ret = tw_get_trend_node(e, false, true);
			if (!ret || !ret.node || ret.is_tweet)
				continue;

			let icon = ret.node.querySelector("div[role='presentation']");
			if (!icon || icon.clientHeight >= 25)
				continue;
			if (ret.is_cardwrap) {
				let par = tw_get_trend_node(ret.node.parentNode, false, true);
				if (par && par.is_tweet)
					continue;
			}

			let name = "";
			let name_node = e.parentNode.parentNode.querySelector("span");
			if (name_node && name_node.firstChild) {
				let intxt = tw_get_text(name_node);
				if (intxt)
					name = intxt;
			}
			if (name == "Twitter モーメント" || name == "Twitter Moments")
				continue;
			ret.key = e.getAttribute("aria-label");
			ret.m = name;

			tw_set_hide(ret);
		}
		catch(e) {
			console.log("tw_lable_err", e);
			if (err_cnt++ > 10)
				return;
		}
	}
}

function tw_is_pictradius(n) {
	let e = n;
	for (let i=0; i < 10 && e && e.tagName != "ARTICLE"; i++) {
		let style = getComputedStyle(e);
		if (parseInt(style.borderTopLeftRadius) >= 10)
			return true;
		e = e.parentNode;
	}
	return false;
}

function tw_pictlist() {
	let idx = tw_cur_url.indexOf("/lists/");
	if (idx < 0) return;
	let id = tw_cur_url.slice(idx + 7);
	let list_num = Number(id);
	if (list_num == NaN || !tw_pictlist_set.has(list_num)) return;

	let err_cnt = 0;
	let ign_key = "pict";
	let ign_str = tw_gen_ign(ign_key);

	let top = document.querySelector("div[aria-label='タイムライン: リスト'],div[aria-label='Timeline: List']");
	if (!top || !top.firstChild) return;
	top = top.firstChild;

//	console.log("tw_pictlist: ", list_num);
	let info = {node:null, is_cardwrap:false, m:"", key:""};

	for (let n of top.querySelectorAll(":scope > div > div" + ign_str)) {
		if (n == top.parentNode.firstChild) continue;
		let url = tw_get_tweet_url(n);
		if (!url) continue;

		let photo = url + "/photo/";

		try {
			let d = n.querySelector("a[href*='/photo/']");
			if (d) {
				let img = d.querySelector("img");
				if (!img)
					continue; // constructing...

				if (tw_is_pictradius(d)) {
					tw_set_twf(n, ign_key);	
					continue;
				}
			}
			else {
				let v = n.querySelector("div[data-testid='videoPlayer'],div[role='progressbar']");
				if (v) {
					tw_set_twf(n, ign_key);	
					continue;
				}
			}
			tw_set_twf(n, ign_key);	
			info.node = n;
			console.debug("tw_pict: ", n.innerText.slice(0, 80).replace(/\n/g, " "));
			tw_set_hide(info);
		}
		catch(e) {
			console.log("tw_lable_err", e);
			if (err_cnt++ > 10)
				return;
		}
	}
}


function tw_filter_core() {
	while (1) {
		tw_guard_next = 0;
		if (tw_opt.tw_enabled) {
			tw_mob_stat();

			// console.log("tw_filter_core loop");
			if (tw_opt.tw_promo_del || tw_opt.tw_purge_trends)
				tw_promo_check();

			if (tw_pictlist_set)
				tw_pictlist();

			if (tw_opt.tw_movement)
				tw_movement();

			if (tw_opt.tw_recommend)
				tw_recommend();

			if (tw_opt.tw_recom_topic)
				tw_recom_topic();

			if (tw_opt.tw_recommend || tw_opt.tw_recom_topic)
				tw_recommend_timeline();

			if (tw_opt.tw_explore_verify)
				tw_explore_verify();

			if (tw_opt.tw_fold)
				tw_fold_check(false);
		}
		if (tw_guard_next == 0)
			break;
	}
	tw_guard = 0;
}

function tw_filter() {
	let url_changed = (tw_cur_url != location.href);

	if (url_changed) {
		// console.log("tw_filter url changed", tw_cur_url, location.href);
		tw_cur_url = location.href;
	}
	if (tw_is_mobile) {
		let need_init = tw_opt.tw_enabled && tw_opt.tw_fold;
		if (need_init && tw_mob.init != 1)
			tw_mob_init();
//		else if (!need_init && tw_mob.init != -1)
//			tw_mob_uninit();
	}

	if (url_changed)
		tw_set_badge(tw_badge_mode.reset | (tw_opt.tw_enabled ? 0 : tw_badge_mode.disable));

	if (tw_guard == 0) {
		tw_guard = 1;
		tw_filter_core();
	}
	else if (tw_guard_next == 0) {
		tw_guard_next = 1;
	}
}

function tw_keyevent(e) {
	if (/*!tw_opt.tw_enabled ||*/ !tw_opt.tw_shortcut) return true;

	let spell_check = document.activeElement.getAttribute("spellcheck") ? true : false;
	let	eated = false;

	if (spell_check) {
		if (e.keyCode == 13 && e.ctrlKey && tw_opt.tw_shortcut == 2)
			eated = true;
	}
	else if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
		switch (e.keyCode) { // n, f, r, t, m, u, b, 
		case 0x42: // 'B'
		case 0x46: // 'F'
		case 0x4d: // 'M'
		case 0x4e: // 'N'
		case 0x52: // 'R'
		case 0x54: // 'T'
		case 0x55: // 'U'
			eated = true;
			break;
		}
	}

	if (eated) {
		e.stopImmediatePropagation();
		e.preventDefault();
		console.debug("tw_key eated=", eated, e.keyCode, e.ctrlKey, spell_check, document.activeElement);
		return false;
	}
	return true;
}

function tw_main() {
	//console.log("tw_main");
	if (location.href.match(/twitter\.com\/.*/i)) {
		let mo = new MutationObserver(tw_filter);
		mo.observe(document.body, {childList:true, subtree: true});
	}
	document.body.addEventListener("keydown", tw_keyevent, false);
}

chrome.runtime.onMessage.addListener(function(req, sender, res) {
	if (req.cmd == "load_done") {
		// console.debug("tw_onMessage(tw_fold): load_done, is_enabled=", req.tw_opt.tw_enabled);
		if (tw_opt.tw_purge_trends != req.tw_opt.tw_purge_trends)
			tw_purge_func = tw_update_purge_func(req.tw_opt.tw_purge_trends);

		tw_opt = req.tw_opt;

		tw_pictlist_set = null;
		if (tw_opt.tw_ext) {
			try {
				let opt = JSON.parse(tw_opt.tw_ext);
				if (opt.pict_list)
					tw_pictlist_set = new Set(opt.pict_list);
			}
			catch(e) {
				console.log("tw_pictlist_set:", e);
			}
		}
		//console.log("tw_pictlist_set:", tw_pictlist_set, tw_opt.tw_ext);

		if (tw_load_cb) {
			let cb = tw_load_cb;
			tw_load_cb = null;
			cb();
		}
	}
	else if (req.cmd == "act") {
//		console.debug("tw_onMessage(tw_fold): act:", req.msg);
		if (req.msg == "onActivated" || req.msg == "onUpdated") {
			tw_load(function() {
			});
		}
	}
	else {
//		console.debug("tw_onMessage(tw_fold): unknown cmd:", msg.cmd);
	}
	return true;
});


//////////////////////////
function tw_mob_listplus(c) {
	let ele = document.createElement("span");
	ele.innerText = tw_foldunset_label;
	ele.style = "padding:10px; color:grey; background-color:transparent; font-weight:bold; font-size:160%;";

	let a = c.querySelector("a[href]");
	if (!a) return;

	ele.onclick = function(e) {
		if (tw_is_firefox) // why?
			history.pushState({foo:"bar"}, "list", location.href);
		location.href = a.href;
	};
	c.firstChild.firstChild.firstChild.appendChild(ele);
}

function tw_mob_stat() {
	if (tw_cur_url.slice(-6) == "/lists") {

		let e = document.querySelector(
				"div[aria-label='タイムライン: 自分のリスト']," +
				"div[aria-label='Timeline: Your Lists']");
		if (e && e.firstChild) {
			let mode = 0;
			for (let c of e.firstChild.childNodes) {
				if (c.tw_mob) continue;

				let txt = c.querySelector('div').textContent;
				if (!txt) continue;

				if (mode == 0) {
	 				if (txt == "新しいリストを見つける" || txt == "Discover new Lists") {
						if (c.firstChild.style.display != "none")
							c.firstChild.style.display = "none"; // should not set c.tw_mob;
						mode = 1;
					}
				}
				else if (mode == 1) {
					if (txt == "自分のリスト" || txt == "Your Lists")
						mode = 2;
					else if (c.firstChild.style.display != "none") {
						c.firstChild.style.display = "none";
						c.tw_mob = 1;
					}
				}
				else if (mode == 2) {
					c.tw_mob = 1;
					tw_mob_listplus(c);
				}
			}
		}
	}

	if (tw_mob.stat == 1) {
		let n = document.querySelector("div[data-testid='DashButton_ProfileIcon_Link']");
		if (!n) return;

		let d = document.querySelector("div[role='dialog']");
		if (!d) return;

		let a = d.querySelector("a[href]");
		if (!a || a.href.indexOf("/", tw_mob.base_url.length + 1) >= 0) return;

		tw_mob.stat = 2;
		tw_mob.name = a.href.slice(tw_mob.base_url.length);
		n.click();
		location.href = "/" + tw_mob.name + "/lists";
	}
	else if (tw_mob.stat == 2) {
		if (tw_cur_url.slice(-6) == "/lists") {
			let d = document.querySelector("div[aria-roledescription='carousel']");
			if (!d) return;

			let home = tw_mob.base_url + "/home";
			/*tw_mob.lists = [ {url:home, txt:"Home"} ];
			for (let a of d.querySelectorAll("a[href]")) {
				if (a.href.indexOf("/i/lists/") == -1)
					continue;
				tw_mob.lists.push({url: a.href, txt:a.innerText});
			}*/
			tw_mob.stat = 0;
			location.href = home;
		}
	}
}

let tw_mobmenu_id = "tw_mobmenu_id";
function tw_mob_init() {
	//console.debug("tw_mob_init");

	tw_mob.init = 1;
	tw_mob.stat = 0;
	tw_mob.time = 0;
	tw_mob.lists = [
		{ url: "https://mobile.twitter.com/home", txt:"home" },
	];
	tw_mob.curIdx = 0;
	tw_mob.bgnX = -1;
	tw_mob.endX = -1;
	tw_mob.name = "";
	tw_mob.base_url = tw_cur_url.slice(0, tw_cur_url.indexOf("/", 10)+1);

/*
	document.body.addEventListener("touchstart", function(e) {
		console.debug("tw_mob_swipe start:", e);
		tw_mob.bgnX = e.touches[0].pageX;
	}, false);

	document.body.addEventListener("touchmove", function(e) {
		// console.debug("tw_mob_swipe move:", e);
		tw_mob.endX = e.touches[0].pageX;
	}, false);

	document.body.addEventListener("touchend", function(e) {
		console.debug("tw_mob_swipe end:", e);
		if (tw_mob.bgnX == -1 || tw_mob.endX == -1 || tw_mob.lists.length <= 1) return;

		let diff = tw_mob.endX - tw_mob.bgnX;
		if (Math.abs(diff) < 30) return;

		let old = tw_mob.curIdx;
		tw_mob.curIdx = (tw_mob.curIdx + (diff >= 30 ? tw_mob.lists.length-1 : 1)) % tw_mob.lists.length;
		location.href = tw_mob.lists[tw_mob.curIdx].url;
		console.debug("tw_mob_swipe: goto ", old, tw_mob.curIdx, location.href);
	}, false);
*/

	let menu = document.querySelector("nav[aria-label='メインメニュー'],nav[aria-label='Primary']");
	if (!menu)
		return;

	let ele = document.createElement("span");
	ele.innerText = tw_menu_label;
	ele.id = tw_mobmenu_id;
	ele.className = menu.lastChild.className;
	ele.style = "background-color:" + (tw_is_dark ? "black" : "white") + "; color:grey; font-size:160%; padding-top:5px"
	ele.onclick = function(e) {
		let d = document.querySelector("div[data-testid='DashButton_ProfileIcon_Link']");
		if (d) {
			tw_mob.stat = 1;
			d.click();
		}
		else {
			history.back()
		}
	};

	menu.appendChild(ele);
}

function tw_mob_uninit() {
	if (tw_mob.init != -1) {
		tw_mob.init = -1;
		try {
			let d = $(tw_mobmenu_id);
			if (d)
				d.parentNode.removeChild(d);
		}
		catch(e) {
			console.debug("tw_mob_uninit:", e);
		}
	}
}
//////////////////////////


console.log("tw_filter loaded");

tw_load(null, true);
tw_main();


