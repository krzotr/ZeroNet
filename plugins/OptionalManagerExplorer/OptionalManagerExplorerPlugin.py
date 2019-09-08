import re
import os
import time
import gevent

from Plugin import PluginManager
from Translate import Translate

bigfile_sha512_cache = {}

plugin_dir = os.path.dirname(__file__)

if "_" not in locals():
    _ = Translate(plugin_dir + "/languages/")

@PluginManager.registerTo("UiWebsocket")
class UiWebsocketPlugin(object):
    def addBigfileInfoExplorer(self, row, include_piecemap=False):
        global bigfile_sha512_cache

        content_db = self.site.content_manager.contents.db
        site = content_db.sites[row["address"]]
        if not site.settings.get("has_bigfile"):
            return False

        file_key = row["address"] + "/" + row["inner_path"]
        sha512 = bigfile_sha512_cache.get(file_key)
        file_info = None
        if not sha512:
            file_info = site.content_manager.getFileInfo(row["inner_path"])
            if not file_info or not file_info.get("piece_size"):
                return False
            sha512 = file_info["sha512"]
            bigfile_sha512_cache[file_key] = sha512

        if sha512 in site.storage.piecefields:
            piecefield = site.storage.piecefields[sha512].tobytes()
        else:
            piecefield = None

        if include_piecemap:
            row["piecemap"] = {}

        if piecefield:
            if include_piecemap:
                row["piecemap"]["own"] = piecefield.replace(b"\x01", b"1").replace(b"\x00", b"0").decode()

            row["pieces"] = len(piecefield)
            row["pieces_downloaded"] = piecefield.count(b"\x01")
            row["downloaded_percent"] = 100 * row["pieces_downloaded"] / row["pieces"]
            if row["pieces_downloaded"]:
                if row["pieces"] == row["pieces_downloaded"]:
                    row["bytes_downloaded"] = row["size"]
                else:
                    if not file_info:
                        file_info = site.content_manager.getFileInfo(row["inner_path"])
                    row["bytes_downloaded"] = row["pieces_downloaded"] * file_info.get("piece_size", 0)
            else:
                row["bytes_downloaded"] = 0

            row["is_downloading"] = bool(next((inner_path for inner_path in site.bad_files if inner_path.startswith(row["inner_path"])), False))

        # Add leech / seed stats
        row["peer_seed"] = 0
        row["peer_leech"] = 0
        for peer in site.peers.values():
            if not peer.time_piecefields_updated or sha512 not in peer.piecefields:
                continue
            peer_piecefield = peer.piecefields[sha512].tobytes()
            if not peer_piecefield:
                continue
            if peer_piecefield == b"\x01" * len(peer_piecefield):
                row["peer_seed"] += 1
            else:
                row["peer_leech"] += 1

            if include_piecemap:
                row["piecemap"][peer.key] = peer_piecefield.replace(b"\x01", b"1").replace(b"\x00", b"0").decode()

        # Add myself
        if piecefield:
            if row["pieces_downloaded"] == row["pieces"]:
                row["peer_seed"] += 1
            else:
                row["peer_leech"] += 1

        return True

    def actionOptionalFileListExplorer(self, to, address=None, orderby="time_downloaded DESC", limit=10, filter="downloaded", filter_inner_path=None, offset=0):
        if not address:
            address = self.site.address

        # Update peer numbers if necessary
        content_db = self.site.content_manager.contents.db
        if time.time() - content_db.time_peer_numbers_updated > 60 * 1 and time.time() - self.time_peer_numbers_updated > 60 * 5:
            # Start in new thread to avoid blocking
            self.time_peer_numbers_updated = time.time()
            gevent.spawn(self.updatePeerNumbers)

        if address == "all" and "ADMIN" not in self.permissions:
            return self.response(to, {"error": "Forbidden"})

        # if not self.hasSitePermission(address):
        #     return self.response(to, {"error": "Forbidden"})

        if not all([re.match("^[a-z_*/+-]+( DESC| ASC|)$", part.strip()) for part in orderby.split(",")]):
            return self.response(to, "Invalid order_by")

        if type(limit) != int:
            return self.response(to, "Invalid limit")

        if type(offset) != int or offset < 0:
            return self.response(to, "Invalid Offset")

        back = []
        content_db = self.site.content_manager.contents.db

        wheres = {}
        wheres_raw = []

        include_piecemap = "include_piecemap" in filter

        if "bigfile" in filter:
            wheres["size >"] = 1024 * 1024 * 10
        if "ignore_piecemapmsgpack" in filter:
            wheres["not__inner_path__like"] = "%.piecemap.msgpack"
        if "downloaded" in filter:
            wheres_raw.append("(is_downloaded = 1 OR is_pinned = 1)")
        if "notdownloaded" in filter:
            wheres["is_downloaded"] = 0
        if "pinned" in filter:
            wheres["is_pinned"] = 1
        if filter_inner_path:
            wheres["inner_path__like"] = filter_inner_path

        if address == "all":
            join = "LEFT JOIN site USING (site_id)"
        else:
            wheres["site_id"] = content_db.site_ids[address]
            join = ""

        if wheres_raw:
            query_wheres_raw = "AND" + " AND ".join(wheres_raw)
        else:
            query_wheres_raw = ""

        query = "SELECT * FROM file_optional %s WHERE ? %s ORDER BY %s LIMIT %d OFFSET %d" % (join, query_wheres_raw, orderby, limit, offset)

        for row in content_db.execute(query, wheres):
            row = dict(row)
            if address != "all":
                row["address"] = address

            if row["size"] > 1024 * 1024:
                has_info = self.addBigfileInfoExplorer(row, include_piecemap)
            else:
                has_info = False

            if not has_info:
                if row["is_downloaded"]:
                    row["bytes_downloaded"] = row["size"]
                    row["downloaded_percent"] = 100
                else:
                    row["bytes_downloaded"] = 0
                    row["downloaded_percent"] = 0

            back.append(row)
        self.response(to, back)


@PluginManager.registerTo("UiRequest")
class UiRequestPlugin(object):
    def actionWrapper(self, path, extra_headers=None):
        match = re.match(r"/(?P<address>[A-Za-z0-9\._-]+)/OptionalManagerExplorer$", path)
        if not match:
            return super(UiRequestPlugin, self).actionWrapper(path, extra_headers)
        address = match.group("address")

        if not self.server.site_manager.get(address):
            return super(UiRequestPlugin, self).actionWrapper(path, extra_headers)

        if self.server.site_manager.isDomain(address):
            address = self.server.site_manager.resolveDomain(address)

        site = self.server.site_manager.get(address)

        if not extra_headers:
            extra_headers = {}

        script_nonce = self.getScriptNonce()

        self.sendHeader(extra_headers=extra_headers, script_nonce=script_nonce)

        return iter([super(UiRequestPlugin, self).renderWrapper(
            site, path, "uimedia/plugins/optionalmanagerexplorer/wrapper.html?address=" + address,
            "Optional Manager Explorer", extra_headers, show_loadingscreen=False, script_nonce=script_nonce
        )])

    def actionUiMedia(self, path, *args, **kwargs):
        if path.startswith("/uimedia/plugins/optionalmanagerexplorer/"):
            file_path = path.replace("/uimedia/plugins/optionalmanagerexplorer/", plugin_dir + "/media/")
            return self.actionFile(file_path)

        return super(UiRequestPlugin, self).actionUiMedia(path)


@PluginManager.registerTo("Site")
class SitePlugin(object):
    def needFile(self, inner_path, *args, **kwargs):
        if inner_path.endswith("|all"):
            inner_path = inner_path[0:-4]

            for ws in self.websockets:
                ws.cmd("notification", ["info", "File <strong>%s</strong> added to queue." % inner_path, 7500])

                kwargs["priority"] = 10

        return super(SitePlugin, self).needFile(inner_path, *args, **kwargs)
