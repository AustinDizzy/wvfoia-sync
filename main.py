import argparse
import logging
import sys
import time
import requests
from datetime import datetime
import random
import sqlite3
from fake_useragent import UserAgent
from bs4 import BeautifulSoup

global db

# crawler will sleep for a random amount of time between these two values
CRAWLER_SLEEP = (100, 500)

# the latest entry ID in the web database
LATEST_ENTRY_ID = 49166

# the default database file
DEFAULT_DB = "wvfoia.db"

# latest now is 43480, we'll test the crawler to reach this later

def get_entry(id: int) -> dict:
    """
    Gets the entry with the given ID from the web database and returns its data as a dictionary.
    """
    r = requests.get(
        f"https://erls.wvsos.gov/FOIA_Entry/SearchedEntryDetails?entryId={id}",
        headers={"User-Agent": UserAgent().random},
        allow_redirects=False,
    )

    if r.status_code == 302:
        logging.info(f"Entry {id} does not exist.")
        return None

    # Extracting data
    pg = BeautifulSoup(r.text, "html.parser")
    labels = pg.select(".content-col-label .content-div-var strong")
    data = pg.select(".content-col-data .content-div-var")
    additional_data = pg.select(".container-requestitems .panel-body")

    # Mapping labels to data
    entry = {
        label.get_text(strip=True).replace(":", "").lower().replace(" ", "_"): data[
            i
        ].get_text(strip=True)
        for i, label in enumerate(labels)
    }

    # Adding ID and additional details
    entry["id"] = id
    entry.update(
        {
            item.strong.get_text(strip=True).lower().replace(" ", "_"): item.p.get_text(
                strip=True
            )
            for item in additional_data
            if item.strong and item.p
        }
    )

    # Converting date format from MM/DD/YYYY to YYYY-MM-DD
    entry["request_date"], entry["completion_date"], entry["entry_date"] = [
        datetime.strptime(date, "%m/%d/%Y").strftime("%Y-%m-%d")
        for date in [entry["request_date"], entry["completion_date"], entry["entry_date"]]
    ]

    entry["is_amended"] = 1 if "amended" in entry else 0
    try:
        del entry["amended"]
    except KeyError:
        pass

    return entry


def does_entry_exist(id: int) -> bool:
    """
    Checks if an entry with the given ID exists in the database.
    """
    c = db.cursor()
    c.execute("SELECT COUNT(*) FROM entries WHERE id=?", (id,))
    return c.fetchone()[0] > 0


def get_entry_count() -> int:
    """
    Gets the number of entries in the database.
    """
    c = db.cursor()
    c.execute("SELECT COUNT(*) as count FROM entries")
    return c.fetchone()[0]


def save_entry(entry: dict) -> dict | None:
    """
    Saves the given entry dictionary to the 'entries' table in the SQLite database.

    :param db: An opened sqlite3 database connection.
    :param entry: A dictionary containing entry data.
    """
    columns = ", ".join(entry.keys())
    placeholders = ", ".join("?" * len(entry))
    query = f"INSERT INTO entries ({columns}) VALUES ({placeholders})"

    try:
        db.execute(query, tuple(entry.values()))
        db.commit()
        return entry
    except sqlite3.Error as e:
        print(f"An error occurred: {e}")


def sync_entry(id: int) -> dict | None:
    """
    Syncs the entry with the given ID from the web database to the local database.
    """
    entry = get_entry(id)
    if entry is None:
        return None

    if not does_entry_exist(id):
        return save_entry(entry)
    else:
        print(f"Entry {id} already exists in the database.")
        return None


def get_random_id(end_id: int = LATEST_ENTRY_ID, start_id: int = 1) -> int:
    """
    Gets a random entry ID from the database.
    """
    cursor = db.cursor()

    cursor.execute("SELECT id FROM entries")
    existing_ids = set(row[0] for row in cursor.fetchall())

    all_ids = set(range(start_id, end_id + 1))
    available_ids = all_ids - existing_ids

    if not available_ids:
        return -1

    random_id = random.choice(list(available_ids))
    logging.info(f"Random ID {random_id} selected.")
    return random_id


def sync_range(range: str) -> None:
    start = int(min(range.split("-")))
    end = int(max(range.split("-")))
    n = 0

    while get_entry_count() < end:
        now = datetime.now()
        random_id = get_random_id(end_id=end, start_id=start)
        if random_id == -1:
            print("Sync reached end of range.")
            break
        else:
            try:
                e = sync_entry(random_id)
                s = random.randint(min(CRAWLER_SLEEP), max(CRAWLER_SLEEP))
                n += 1
                if e:
                    print(f"{datetime.now().replace(microsecond=0)} ✅ #{e['id']}\t", end="")
                else:
                    print(f"{datetime.now().replace(microsecond=0)} ❌ #{random_id}\t", end="")
                print(f"in {(datetime.now() - now).total_seconds():0.2f}s ... ", end="")
                print(f"⏳ for {s/100:0.2f}s ...")
                time.sleep(s / 100)
            except KeyboardInterrupt:
                print(f" exiting...saved {n} this run")
                sys.exit()


def run_crawler() -> int:
    """
    Crawler mode crawls the web database automatically starting from the last
    known entry ID, checks for new entries, and adds them to the local database.
    Returns the number of entries added.
    """
    logging.info("running crawler...")
    n = 0
    global LATEST_ENTRY_ID

    while True:
        now = datetime.now()
        try:
            e = sync_entry(LATEST_ENTRY_ID + 1)
            if e:
                LATEST_ENTRY_ID += 1
                print(f"{datetime.now().replace(microsecond=0)} ✅ #{e['id']}\t", end="")
                print(
                    f"added in {(datetime.now() - now).total_seconds():0.2f}s ... ", end=""
                )
                s = random.randint(min(CRAWLER_SLEEP), max(CRAWLER_SLEEP))
                print(f"⏳ for {s/100:0.2f}s ...")
                time.sleep(s / 100)
                n += 1
            else:
                print(f"{datetime.now().replace(microsecond=0)} ❕ Latest entry found (#{LATEST_ENTRY_ID}). Crawler exiting...")
                return n
        except KeyboardInterrupt:
            print(f" exiting...added {n} this trip")
            sys.exit()

def main():
    global db

    parser = argparse.ArgumentParser(description="wvfoia-sync cli syncs the WVSOS FOIA Database from the web to a local SQLite(3) database")
    parser.add_argument("--mode", choices=["range", "crawl", "retrieve"], help="change the sync mode", default="retrieve")
    parser.add_argument("--db", default=DEFAULT_DB, help="database file")
    parser.add_argument("--verbose", action="store_true", help="verbose output")
    parser.add_argument("-d", "--debug", action="store_true", help="debug output")
    parser.add_argument("--range", help="range of IDs to sync (requires 'range' mode)")
    parser.add_argument("ids", nargs=argparse.REMAINDER, help="ID")
    args = parser.parse_args()

    # set log level based on command line flags
    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    elif args.verbose:
        logging.basicConfig(level=logging.INFO)
    else:
        logging.basicConfig(level=logging.WARNING)

    logging.info(f"opening database {args.db}...")
    db = sqlite3.connect(args.db)

    match args.mode:
        case "range":
            # for syncing over a defined range of records
            sync_range(args.range)
        case "crawl":
            # for crawling from a known latest entry ID to find new records
            n = run_crawler()
            print(f"Added {n} new entries.")
        case "retrieve" | _:
            # for retrieving a single record or a list of records
            logging.info("running in default (retrieve) mode...")
            if len(args.ids) > 0:
                for id in args.ids:
                    e = get_entry(id)
                    if e:
                        print(
                            "\n".join([f"{key} = {value}" for key, value in e.items()])
                        )
                        if len(args.ids) > 1:
                            print("=" * 40)
                    else:
                        print(f"Entry {id} does not exist.")

    logging.info("done")


if __name__ == "__main__":
    main()
