import Foundation

enum AspectValue: CustomStringConvertible {
    case BoolVal(Bool)
    case StringVal(String)
    case IntVal(Int)
    case DateVal(Date)
    
    var description: String {
        switch self {
        case let .BoolVal(b): return "Boolean: \(b)"
        case let .StringVal(s): return "String: \(s)"
        case let .IntVal(i): return "Integer: \(i)"
        case let .DateVal(d): return "Date: \(d)"
        }
    }
}


struct AspectDescriptor: CustomStringConvertible {
    let name: String
    let type: Any.Type
    let isVisible: Bool
    let isEditable: Bool
    var description: String {
        return "\(name): \(type) visible: \(isVisible) edit: \(isEditable)"
    }
}

func report(_ msg: String) {
    NSLog("Error: \(msg)")
}

let NilString = "(nil)"

var Changes = [(aspect: Aspect, value: Any)]()

class Aspect: CustomStringConvertible {
    let descriptor: AspectDescriptor
    var _value: AspectValue?
    
    var value: Any? {
        get {
            return nil
        }
        set {
            guard let nv = newValue else {
                _value = nil
                return
            }
            if let inv = nv as? Int, descriptor.type == Int.Type.self {
                _value = .IntVal(inv)
            }
            else if let snv = nv as? String, descriptor.type == String.Type.self {
                _value = .StringVal(snv)
            }
            else {
                report("Invalid value: \(newValue ?? NilString) for aspect: \(descriptor)")
                return
            }
            Changes.append((aspect: self, value: nv))
        }
    }
    
    
    init(descriptor: AspectDescriptor) {
        self.descriptor = descriptor
    }
    
    
    var description: String {
        get {
            return "\(descriptor.type): \(_value?.description ?? NilString)"
        }
    }
    
    
    var intValue: Int? {
        get {
            guard let v = _value, case let .IntVal(theInt) = v else {
                return nil
            }
            return theInt
        }
        set {
            guard let nv = newValue else {
                _value = nil
                return
            }
            _value = .IntVal(nv)
        }
    }

    
    var stringValue: String? {
        get {
            guard let v = _value, case let .StringVal(theString) = v else {
                return nil
            }
            return theString
        }
        set {
            guard let nv = newValue else {
                _value = nil
                return
            }
            _value = .StringVal(nv)
        }
    }

}

