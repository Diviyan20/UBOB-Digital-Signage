from models.outlet_screens import (
    create_outlet_screen,
    delete_outlet_screen,
    get_all_outlet_screens,
    get_media_player_screens,
    get_media_player_version,
    get_outlet_screen,
    update_outlet_screen,
)

def fetch_all_outlet_screens():
    return get_all_outlet_screens()

def fetch_outlet_screen(screen_id):
    return get_outlet_screen(screen_id)

def add_outlet_screen(outlet_uid, screen_type, orientation, batch_num=None, tier=None,
                       video_uuid=None, start_datetime=None, end_datetime=None, frequency="Evergreen"):
    return create_outlet_screen(
        outlet_uid=outlet_uid,
        screen_type=screen_type,
        orientation=orientation,
        batch_num=batch_num,
        tier=tier,
        video_uuid=video_uuid,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        frequency=frequency,
    )

def edit_outlet_screen(screen_id, fields):
    return update_outlet_screen(screen_id, fields)

def remove_outlet_screen(screen_id):
    return delete_outlet_screen(screen_id)

def fetch_media_player_screens(outlet_id, batch_number, tier, orientation):
    return get_media_player_screens(
        outlet_id,
        batch_number,
        tier,
        orientation,
    )

def fetch_media_player_version(outlet_id, batch_number, tier, orientation):
    return get_media_player_version(
        outlet_id,
        batch_number,
        tier,
        orientation,
    )