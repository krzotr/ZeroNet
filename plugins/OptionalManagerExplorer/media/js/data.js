class Page extends ZeroFrame {
    address = ""
    limit = 40
    offset = 0
    last_number_of_files = 0
    site_info = {}
    is_in_progress = false
    filters = []
    piecemap = false

    // const
    STATE_NOT_DOWNLOADED = "not-downloaded"
    STATE_DOWNLOADED = "downloaded"
    STATE_DOWNLOADING = "downloading"

    ELEMENT_PAGINATION_NEXT = "pagination-next"
    ELEMENT_PAGINATION_PREV = "pagination-prev"
    ELEMENT_LIMIT = "limit"
    ELEMENT_FILTERS = "filters"
    ELEMENT_SORT = "sort"
    ELEMENT_TABLE = "table"
    ELEMENT_PIECEMAP = "piecemap"

    constructor(url) {
        super(url)

        this.STATE_SHORT = {}
        this.STATE_SHORT[this.STATE_NOT_DOWNLOADED] = "<span class='oi oi-media-stop'></span>"
        this.STATE_SHORT[this.STATE_DOWNLOADED] = "<span class='oi oi-data-transfer-download'></span>"
        this.STATE_SHORT[this.STATE_DOWNLOADING] = "<span class='oi oi-caret-right'></span>"

        this.STATE_STYLES = {}
        this.STATE_STYLES[this.STATE_NOT_DOWNLOADED] = "table-danger"
        this.STATE_STYLES[this.STATE_DOWNLOADED] = "table-success"
        this.STATE_STYLES[this.STATE_DOWNLOADING] = "table-warning"

        this.address = document.location.pathname.match(/([A-Za-z0-9\._-]+)/)[1]
    }

    setVars() {
        this.getNumberOfTotalFiles()

        let limit_element = document.getElementById(this.ELEMENT_LIMIT)

        limit_element.onclick = () => {
            let limit = limit_element.options[limit_element.selectedIndex].value

            this.is_in_progress = false

            this.limit = parseInt(limit)
            this.offset = 0
            this.getFiles()
        }

        let filters_element = document.getElementById(this.ELEMENT_FILTERS)
        filters_element.onclick = () => {
            let filters = filters_element.options[filters_element.selectedIndex].value

            this.is_in_progress = false

            this.filters = filters
            this.offset = 0
            this.getFiles()
        }

        let piecemap_element = document.getElementById(this.ELEMENT_PIECEMAP)
        piecemap_element.onclick = () => {
            this.is_in_progress = false

            this.piecemap = piecemap_element.checked
            this.offset = 0
            this.getFiles()
        }

        let sort_element = document.getElementById(this.ELEMENT_SORT)
        sort_element.onclick = () => {
            let sort = sort_element.options[sort_element.selectedIndex].value

            this.is_in_progress = false

            this.sort = sort
            this.offset = 0
            this.getFiles()
        }

        let prev_element = document.getElementById(this.ELEMENT_PAGINATION_PREV)
        prev_element.onclick = () => {
            if (this.offset - this.limit < 0) {
                alert("Out of range!")
                return
            }

            this.is_in_progress = false

            this.offset -= this.limit
            this.getFiles()
        }

        let next_element = document.getElementById(this.ELEMENT_PAGINATION_NEXT)
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
            "filter": ["ignore_piecemapmsgpack", (this.piecemap ? "include_piecemap" : '')].concat(this.filters),
            "limit": this.limit,
            "offset": this.offset,
            "orderby": this.sort,
            "address": this.address
        }, (resp) => {
            if ("error" in resp) {
                alert("Got error:" + resp.error)
                return
            }

            console.log("Got optionalFileList")

            var table = document.getElementById(this.ELEMENT_TABLE)
            table.innerHTML = ""

            var header_html = ""
            header_html += "<tbody class='thead-dark'>"
            header_html += "<tr>"
            header_html += "<th scope='col' class='text-center'>#</th>"
            header_html += "<th scope='col' class='text-center'><abbr title='State of file: downloaded, downloading, not-downloaded'>State</abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Path of file'>Inner Path</abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Size of the file in MB'>Size</abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Percent of completed file'>%</abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Downloaded parts / Total parts'>D / T</abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Number of peers'><span class='oi oi-people'></span></abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Seeds / Leech'><span class='oi oi-people'></span> / <span class='oi oi-people'></span></abbr></th>"
            header_html += "<th scope='col' class='text-center'><abbr title='Health of file'><span class='oi oi-signal'></span></abbr></th>"
            header_html += "</tr>"
            header_html += "</tbody>"

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
                    let inner_path_element = events[i].getElementsByClassName("inner_path")[0]
                    let inner_path = inner_path_element.getAttribute('data-inner-path')

                    this.cmd("fileNeed", inner_path + "|all")
                }
            }

            this.is_in_progress = false
        })
    }

    renderRow(file, id) {
        var html = ""

        var piecemap = ""

        if (file.state != this.STATE_DOWNLOADED) {
            piecemap = this.getPiecemapHtml(file.piecemap)
        }


        html = '<tr id="fid-' + file.file_id + '" class="file_id ' + this.STATE_STYLES[file.state] + '">'
        html += "<td class='text-center'>" + id + "</td>"
        html += "<td class='text-center'>" + this.STATE_SHORT[file.state] + "</td>"
        html += "<td class='inner_path text-sm' data-inner-path='" + file.inner_path + "'><small>" + file.inner_path + "</small>" + this.getProgressBarHTML(file.downloaded_percent) + piecemap + "</td>"
        html += "<td class='text-center'><small>" + Math.round(file.size / 1024 / 1024, 2) + "MB</small></td>"
        html += "<td class='text-center'><small>" + file.downloaded_percent + "%</small></td>"
        html += "<td class='text-center'><small>" + file.pieces_downloaded + " / " + file.pieces + "</small></td>"
        html += "<td class='text-center'><small>" + file.peer + "</small></td>"
        html += "<td class='text-center'><small>" + file.peer_seed + " / " + file.peer_leech + "</small></td>"
        html += "<td class='text-center' data-health='" + file.health + "'><span class='oi oi-signal signal-" + file.health + "'></span></td>"
        html += "</tr>"


        return html
    }

    getProgressBarHTML(percent) {
        if (percent == 0) {
            //return ''
        }

        var html = ""

        var style = "bg-success"

        if (percent == 0) {
            style = "bg-danger"
        } else if (percent != 100) {
            style = "bg-warning"
        }

        html += '<div class="progress" style="height: 4px;">'
            html += '<div class="progress-bar ' + style + '" role="progressbar" style="width: ' + percent + '%" aria-valuenow="' + percent + '" aria-valuemin="0" aria-valuemax="100"></div>'
        html += '</div>'

        return html
    }

    getPiecemapHtml(piecemap) {
        if (piecemap.length == 0) {
            return ''
        }

        var html = ""

        html += '<div class="container-fluid" style="margin-top: 10px">'

            html += '<div class="row">'
                for (var key in piecemap) {
                    html += '<div class="col-2 text-right">'
                        html += '<small>' + key + '</small>'
                    html += '</div>'

                    html += '<div class="col-10">'
                        html += '<div class="progress" style="height: 10px; margin-top: 3px;">'

                        var map = piecemap[key]

                        var step = 1 / map.length * 100
                        for (var i = 0; i < map.length; i++) {
                            var style = (map[i] == '1' ? 'success' : 'danger')

                            html += '<div class="progress-bar bg-' + style + '" role="progressbar" style="width: ' + step + '%" aria-valuenow="' + step + '" aria-valuemin="0" aria-valuemax="100"></div>'
                        }

                        html += '</div>'
                    html += '</div>'
                }
            html += '</div>'

        html += '</div>'

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

            // New field
            piecemap: "piecemap" in file ? file.piecemap : {},

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
            state: this.STATE_NOT_DOWNLOADED,
            health: 0
        }

        // Should be fine, but is some bug in Zeronet
        if (entity.is_downloading) {
            entity.state = this.STATE_DOWNLOADING
        } else if (entity.is_downloaded) {
            entity.state = this.STATE_DOWNLOADED
        }

        // Workaround
        if (entity.pieces > 0 && entity.pieces == entity.pieces_downloaded) {
            entity.state = this.STATE_DOWNLOADED
        } else if (entity.pieces_downloaded > 0 && entity.pieces != entity.pieces_downloaded) {
            entity.state = this.STATE_DOWNLOADING
        } else {
            entity.state = this.STATE_NOT_DOWNLOADED
        }

        // Set downloaded_percent
        if (entity.state == this.STATE_DOWNLOADED) {
            entity.downloaded_percent = 100
        }

        if (entity.state == this.STATE_DOWNLOADED) {
            entity.health = 3
        } else if (file.peer_seed > 0) {
            if (file.peer_seed > 4) {
                entity.health = 3
            } else if (file.peer_seed > 1) {
                entity.health = 2
            } else {
                entity.health = 1
            }
        }

        return entity
    }
}
