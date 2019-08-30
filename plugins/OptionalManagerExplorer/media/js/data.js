class Page extends ZeroFrame {
    address = ""
    limit = 40
    offset = 0
    last_number_of_files = 0
    site_info = {}
    is_in_progress = false

    // const
    STATE_NOT_DOWNLOADED = "not-downloaded"
    STATE_DOWNLOADED = "downloaded"
    STATE_DOWNLOADING = "downloading"

    constructor(url) {
        super(url)

        this.address = document.location.pathname.match(/([A-Za-z0-9\._-]+)/)[1]
    }

    setVars() {
        this.getNumberOfTotalFiles()

        let limit_element = document.getElementById("limit")

        limit_element.onclick = () => {
            let limit = limit_element.options[limit_element.selectedIndex].value

            this.is_in_progress = false

            this.limit = parseInt(limit)
            this.offset = 0
            this.getFiles()
        }

        let prev_element = document.getElementById("prev")
        prev_element.onclick = () => {
            if (this.offset - this.limit < 0) {
                alert("Out of range!")
                return
            }

            this.is_in_progress = false

            this.offset -= this.limit
            this.getFiles()
        }

        let next_element = document.getElementById("next")
        next_element.onclick = () => {
            if (this.limit > this.last_number_of_files) {
                alert("Out of range")
                return
            }

            this.is_in_progress = false

            this.offset += this.limit
            this.getFiles()
        }
    }

    onOpenWebsocket () {
        this.getFiles()
    }

    onRequest() {
        if (this.is_in_progress) {
            console.log("Got request")
            return
        }

        this.getFiles()
    }

    getNumberOfTotalFiles() {
        this.cmd("siteInfo", {}, (site_info) => {
            this.site_info = site_info

            this.total_files = this.site_info.content.files_optional
        })
    }

    getFiles () {
        this.setVars()

        this.is_in_progress = true

        this.cmd("optionalFileList", {
            "filter": "ignore_piecemap",
            "limit": this.limit,
            "offset": this.offset,
            "orderby": "time_added DESC, file_id ASC",
            "address": this.address
        }, (resp) => {
            if ("error" in resp) {
                alert("Got error:" + resp.error)
                return
            }

            console.log("Got optionalFileList")


            var table = document.getElementById("table")
            table.innerHTML = ""

            var header_html = ""
            header_html += "<tr>"
            header_html += "<th>ID</th>"
            header_html += "<th>State</th>"
            header_html += "<th>Inner Path</th>"
            header_html += "<th>Size</th>"
            header_html += "<th>%</th>"
            header_html += "<th>D / T</th>"
            header_html += "<th>P</th>"
            header_html += "<th>S / L</th>"
            header_html += "</tr>"

            table.insertAdjacentHTML("beforeend", header_html)

            var id = this.offset + 1
            for (var i in resp) {
                var row_html = this.renderRow(this.normalizeFile(resp[i]), id)

                table.insertAdjacentHTML("beforeend", row_html)
                id += 1
            }

            this.last_number_of_files = resp.length

            var events = document.getElementsByClassName("file_id")

            for (let i = 0; i < events.length; i++) {
                if (events[i].getAttribute("class").match(/completed/)) {
                    continue
                }

                events[i].onclick = () => {
                    let inner_path = events[i].getElementsByClassName("inner_path")[0].innerHTML
                    this.cmd("fileNeed", inner_path + "|all")
                }
            }

            this.is_in_progress = false
        })
    }

    renderRow(file, id) {
        var html = ""

        html = '<tr id="fid-' + file.file_id + '" class="file_id ' + file.state + '">'

        html += "<td>" + id + "</td>"
        html += "<td>" + file.state + "</td>"
        html += "<td class='inner_path'>" + file.inner_path + "</td>"
        html += "<td>" + Math.round(file.size / 1024 / 1024, 2) + "MB</td>"
        html += "<td>" + file.downloaded_percent + "%</td>"
        html += "<td>" + file.pieces_downloaded + " / " + file.pieces + "</td>"
        html += "<td>" + file.peer + "</td>"
        html += "<td>" + file.peer_seed + " / " + file.peer_leech + "</td>"

        html += "</tr>"

        return html
    }

    normalizeFile(file) {
        var entity = {
            address: file.address,
            bytes_downloaded: file.bytes_downloaded,

            file_id: file.file_id,
            hash_id: file.hash_id,
            inner_path: file.inner_path,
            is_downloaded: file.is_downloaded ? true : false,
            is_downloading: "is_downloading" in file ? (file.is_downloading ? true : false) : false,
            is_pinned: file.is_pinned ? true : false,
            peer: file.peer,

            // Ext Stats
            peer_leech: "peer_leech" in file ? file.peer_leech : 0,
            peer_seed: "peer_leech" in file ? file.peer_seed : 0,
            pieces: "pieces" in file ? file.pieces : 0,
            pieces_downloaded: "pieces_downloaded" in file ? file.pieces_downloaded : 0,
            downloaded_percent: "downloaded_percent" in file ? Math.floor(file.downloaded_percent) : 0,

            site_id: file.site_id,
            size: file.size,
            time_accessed: file.time_accessed,
            time_added: file.time_added,
            time_downloaded: file.time_downloaded,
            uploaded: file.uploaded,

            // Custom Fields
            state: this.STATE_NOT_DOWNLOADED
        }

        // Set state
        if (entity.is_downloading) {
            entity.state = this.STATE_DOWNLOADING
        } else if (entity.is_downloaded) {
            entity.state = this.STATE_DOWNLOADED
        }

        // Set download_percent
        if (entity.state == this.STATE_DOWNLOADED) {
            entity.downloaded_percent = 100
        }

        return entity
    }
}
