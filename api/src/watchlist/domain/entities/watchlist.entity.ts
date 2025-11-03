export class Watchlist {
  private _id: number;
  private _user_id: number;
  private _name: string;
  private _description: string;
  private _is_default: boolean;
  private _created_at: Date;
  private _updated_at: Date;

  constructor(
    id: number,
    user_id: number,
    name: string,
    description: string | null,
    is_default: boolean,
  ) {
    this._id = id;
    this._user_id = user_id;
    this._name = name;
    this._description = description || '';
    this._is_default = is_default;
  }


  get id(): number {
    return this._id;
  }

  get user_id(): number {
    return this._user_id;
  }

  get name(): string {
    return this._name;
  }

  get description(): string {
    return this._description;
  }

  get is_default(): boolean {
    return this._is_default;
  }

  get created_at(): Date {
    return this._created_at;
  }

  get updated_at(): Date {
    return this._updated_at;
  }


  set id(value: number) {
    this._id = value;
  }

  set user_id(value: number) {
    this._user_id = value;
  }

  set name(value: string) {
    this._name = value;
  }

  set description(value: string) {
    this._description = value;
  }

  set is_default(value: boolean) {
    this._is_default = value;
  }

  set created_at(value: Date) {
    this._created_at = value;
  }

  set updated_at(value: Date) {
    this._updated_at = value;
  }
}
