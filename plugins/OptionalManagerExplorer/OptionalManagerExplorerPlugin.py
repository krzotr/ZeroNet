import re
import hashlib
import os

from Plugin import PluginManager
from Translate import Translate

plugin_dir = os.path.dirname(__file__)

if "_" not in locals():
    _ = Translate(plugin_dir + "/languages/")


@PluginManager.registerTo("UiWebsocket")
class UiWebsocketPlugin(object):
    def actionGetAllMediafiles(self, to, address):
        self.response(to, address)


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

        if address:
            address_sha256 = "0x" + hashlib.sha256(address.encode("utf8")).hexdigest()
        else:
            address_sha256 = None

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
