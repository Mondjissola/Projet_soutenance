import sqlite3

# Met à jour le champ `difficulte` pour chaque plante afin de refléter
# les conditions de culture en Afrique (disponibilité, besoins en eau,
# sensibilité aux maladies, exigences agronomiques).

DB_PATH = r"db.sqlite3"

MAPPING = {
    # Faciles (robustes, faibles intrants, tolérance à la sécheresse)
    "manioc": "easy",
    "mais": "easy",
    "millet": "easy",
    "sorgho": "easy",
    "niébé": "easy",
    "arachide": "easy",
    "Sésame": "easy",
    "gombo": "easy",
    "pois_d_angole": "easy",
    "corete_potagere": "easy",
    "corète": "easy",
    "corète ": "easy",  # clé avec espace final
    "cléome": "easy",
    "citronnelle": "easy",
    "tetragone": "easy",
    "épinard_africain": "easy",
    "pissenlit africain": "easy",
    "patate_douce": "easy",
    "citrouille": "easy",
    "courge": "easy",
    "moringa": "easy",
    "oignon": "easy",
    "basilic": "easy",
    "aubergine_africaine": "easy",

    # Moyennes (exigences modérées, arrosage régulier, sensibilité moyenne)
    "fonio": "medium",
    "igname": "medium",
    "soja": "medium",
    "souchet": "medium",
    "tomate": "medium",
    "piment": "medium",
    "poivron": "medium",
    "chou": "medium",
    "melon": "medium",
    "concombre": "medium",
    "carotte": "medium",
    "betterave": "medium",
    "fenouil": "medium",
    "menthe": "medium",
    "coriandre": "medium",
    "banane": "medium",
    "avocat": "medium",
    "papaye": "medium",
    "gingembre": "medium",
    "haricot": "easy",  # haricot commun reste facile
    "haricots_niangon": "medium",
    "aubergine": "medium",
    "dalo": "medium",
    "taro": "medium",
    "patate_amere": "medium",
    "anacarde": "medium",
    "ail": "medium",

    # Difficiles (irrigation/paludiculture, exigences climatiques spécifiques)
    "riz": "difficult",
    "lavande": "difficult",
    "laitue": "difficult",
    "poivre de Guinée": "difficult",
    "poivre_de_guinée": "difficult",
}


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    updated = 0
    for key, diff in MAPPING.items():
        cur.execute(
            "UPDATE AgriSmart_plantinfo SET difficulte=? WHERE key=?",
            (diff, key),
        )
        updated += cur.rowcount

    conn.commit()

    # Statistiques
    rows = cur.execute(
        "SELECT key, difficulte FROM AgriSmart_plantinfo ORDER BY key"
    ).fetchall()
    counts = {"easy": 0, "medium": 0, "difficult": 0}
    for _, d in rows:
        if d in counts:
            counts[d] += 1

    missing = [k for (k, _) in rows if k not in MAPPING]

    print(f"Rows updated: {updated}")
    print(f"Counts: {counts}")
    # Affiche les 20 premières pour contrôle visuel
    print("Sample:", rows[:20])
    if missing:
        print("Non couverts:", missing)

    conn.close()


if __name__ == "__main__":
    main()