# wvfoia-sync

This project syncs a local SQLite database with the contents of the [(WV)FOIA Database maintained by the West Virginia Secretary of State's Office](https://erls.wvsos.gov/FOIA_Database/Search).

* https://l.abs.codes/data/wv-foia - browse and query the database via Datasette
* [Latest Release (v1.0.2025-04-24)](https://github.com/AustinDizzy/wvfoia-sync/releases/latest) - download the latest database in full

The database is updated automatically every day at 4AM Eastern Time and published via a new GitHub Release. The updated database is then immediately available on the Datasette instance.

## Usage

```
$ python3 main.py --help
usage: main.py [-h] [--mode {range,retrieve,crawl}] [--db DB] [--verbose] [-d] [--range RANGE] ...

wvfoia-sync cli syncs the WVSOS FOIA Database from the web to a local SQLite(3) database

positional arguments:
  ids                   ID

options:
  -h, --help            show this help message and exit
  --mode {range,retrieve,crawl}
                        change the sync mode
  --db DB               database file
  --verbose             verbose output
  -d, --debug           debug output
  --range RANGE         range of IDs to sync (requires 'range' mode)
```

There are three primary modes:
* **range** - does a random spray retrieval on entries between a range (ex. 1 - 1000)
* **crawl** - begins a crawl from a last known entry ID and continues until the first unknown entry
* **retrieve** - simply retrieves the details from one (or multiple) FOIA Database entries and displays them

## License
GNU General Public License v3.0. See [LICENSE](./LICENSE) for full license text.

This license only applies to the code and code assets in this repository. The data contained in the database in the release assets is classified as public record under West Virginia Code and is released by the West Virginia Secretary of State pursuant to [W. Va. Code of State Rules § 153-52](https://apps.sos.wv.gov/adlaw/csr/rule.aspx?rule=153-52) and [W. Va. Code § 29B-1-3(f)](https://code.wvlegislature.gov/29B-1-3/).

To increase open access to the dataset, data is released under the [Open Commons Public Domain Dedication and License(PDDL) v1.0](https://opendatacommons.org/licenses/pddl/1-0/).